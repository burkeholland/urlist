import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { checkLinkHealth } from '@/lib/link-health';
import type { LinkWithId } from '@/lib/types';

vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}));

const link = (overrides: Partial<LinkWithId> = {}): LinkWithId => ({
  id: 'link-1',
  url: 'https://example.com/start',
  position: 0,
  pinned: false,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  createdAt: 1,
  healthFailureCount: 0,
  ...overrides,
});

const html = `
  <html>
    <head>
      <title>Fallback Title</title>
      <meta property="og:title" content="Fresh Title">
      <meta property="og:description" content="Fresh Description">
      <meta property="og:image" content="https://cdn.example.com/new.png">
      <meta property="og:site_name" content="Fresh Site">
    </head>
  </html>
`;

function response(status: number, body = '', headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

describe('checkLinkHealth', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('marks a 200 response healthy and refreshes empty metadata', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(response(200, html, { 'content-type': 'text/html' })));

    const result = await checkLinkHealth(link(), { fetchImpl, now: 100 });

    expect(result).toMatchObject({
      healthStatus: 'healthy',
      healthReason: 'ok',
      healthCheckedAt: 100,
      healthFinalUrl: 'https://example.com/start',
      healthHttpStatus: 200,
      healthFailureCount: 0,
      metadataRefreshedAt: 100,
      metadataRefreshStatus: 'updated',
      ogTitle: 'Fresh Title',
      ogDescription: 'Fresh Description',
      ogImage: 'https://cdn.example.com/new.png',
      ogSiteName: 'Fresh Site',
    });
  });

  it('follows redirect chains and stores the final URL without changing the destination', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(301, '', { location: '/middle' }))
      .mockResolvedValueOnce(response(302, '', { location: 'https://example.org/final' }))
      .mockResolvedValueOnce(response(200, html, { 'content-type': 'text/html' }));

    const result = await checkLinkHealth(link(), { fetchImpl, now: 200 });

    expect(result.healthStatus).toBe('redirected');
    expect(result.healthReason).toBe('redirect');
    expect(result.healthFinalUrl).toBe('https://example.org/final');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('distinguishes permanent 404 and 410 outcomes', async () => {
    await expect(checkLinkHealth(link(), {
      fetchImpl: vi.fn().mockResolvedValue(response(404)),
      now: 300,
    })).resolves.toMatchObject({ healthStatus: 'broken', healthReason: 'http_404', healthHttpStatus: 404 });

    await expect(checkLinkHealth(link(), {
      fetchImpl: vi.fn().mockResolvedValue(response(410)),
      now: 301,
    })).resolves.toMatchObject({ healthStatus: 'broken', healthReason: 'http_410', healthHttpStatus: 410 });
  });

  it('retries transient 5xx outcomes and keeps them possibly broken', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(503));

    const result = await checkLinkHealth(link({ healthFailureCount: 1 }), { fetchImpl, now: 400 });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      healthStatus: 'transient',
      healthReason: 'http_5xx',
      healthHttpStatus: 503,
      healthFailureCount: 2,
    });
  });

  it('classifies repeated timeouts separately after retries', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = vi.fn().mockRejectedValue(timeout);

    const result = await checkLinkHealth(link(), { fetchImpl, now: 500 });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      healthStatus: 'broken',
      healthReason: 'repeated_timeout',
      healthHttpStatus: null,
      healthFailureCount: 1,
      metadataRefreshStatus: 'failed',
    });
  });

  it('blocks private redirect hops before fetching them', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(302, '', { location: 'http://10.0.0.2/admin' }));

    const result = await checkLinkHealth(link(), { fetchImpl, now: 600 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      healthStatus: 'broken',
      healthReason: 'ssrf_blocked',
      healthFinalUrl: null,
    });
  });

  it('distinguishes DNS failures', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockRejectedValueOnce(new Error('ENOTFOUND'));
    const fetchImpl = vi.fn();

    const result = await checkLinkHealth(link({ url: 'https://missing.example' }), { fetchImpl, now: 700 });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      healthStatus: 'broken',
      healthReason: 'dns_error',
    });
  });

  it('does not overwrite owner-edited title or description unless confirmed', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(response(200, html, { 'content-type': 'text/html' })));
    const ownerEdited = link({
      ogTitle: 'Owner Title',
      ogDescription: 'Owner Description',
      ogImage: 'https://cdn.example.com/old.png',
      ogSiteName: 'Old Site',
    });

    const safeRefresh = await checkLinkHealth(ownerEdited, { fetchImpl, now: 800 });
    expect(safeRefresh.ogTitle).toBeUndefined();
    expect(safeRefresh.ogDescription).toBeUndefined();
    expect(safeRefresh.ogImage).toBe('https://cdn.example.com/new.png');

    const confirmed = await checkLinkHealth(ownerEdited, {
      fetchImpl,
      now: 801,
      confirmMetadataOverwrite: true,
    });
    expect(confirmed.ogTitle).toBe('Fresh Title');
    expect(confirmed.ogDescription).toBe('Fresh Description');
  });

  it('refreshes existing metadata when fields are not marked owner-edited', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(response(200, html, { 'content-type': 'text/html' })));
    const staleScrapedMetadata = link({
      ogTitle: 'Stale Title',
      ogDescription: 'Stale Description',
      ogTitleUserEdited: false,
      ogDescriptionUserEdited: false,
    });

    const result = await checkLinkHealth(staleScrapedMetadata, { fetchImpl, now: 900 });

    expect(result.ogTitle).toBe('Fresh Title');
    expect(result.ogDescription).toBe('Fresh Description');
  });
});
