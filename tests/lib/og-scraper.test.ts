import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { scrapeOgMetadata } from '@/lib/og-scraper';

vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}));

const html = `
  <html>
    <head>
      <meta property="og:title" content="Example Title">
      <meta property="og:description" content="Example Description">
      <meta property="og:image" content="https://example.com/img.png">
      <meta property="og:site_name" content="Example">
    </head>
  </html>
`;

function response(status: number, body = '', headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

describe('scrapeOgMetadata', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, html, { 'content-type': 'text/html' })));
  });

  it('returns metadata for a valid URL', async () => {
    const result = await scrapeOgMetadata('https://example.com');
    expect(result).toEqual({
      url: 'https://example.com',
      ogTitle: 'Example Title',
      ogDescription: 'Example Description',
      ogImage: 'https://example.com/img.png',
      ogSiteName: 'Example',
    });
  });

  it('returns null metadata for invalid URL', async () => {
    const result = await scrapeOgMetadata('not-a-url');
    expect(result.ogTitle).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('follows redirects through the SSRF-safe path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(301, '', { location: '/next' }));
    vi.mocked(fetch).mockResolvedValueOnce(response(200, html, { 'content-type': 'text/html' }));

    const result = await scrapeOgMetadata('https://example.com/start');

    expect(result.ogTitle).toBe('Example Title');
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://example.com/start',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('blocks private redirect hops and logs the SSRF block', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(302, '', { location: 'http://127.0.0.1/admin' }));

    const result = await scrapeOgMetadata('https://example.com/start');

    expect(result.ogTitle).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      message: 'SSRF blocked: https://example.com/start',
      service: 'og-scraper',
      data: { error: 'URL resolves to a private/internal IP range.' },
    }));
  });

  it('fails closed when DNS cannot resolve', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await scrapeOgMetadata('https://missing.example');

    expect(result.ogTitle).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      data: { error: 'URL hostname could not be safely resolved.' },
    }));
  });
});
