import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/og/route';
import { scrapeOgMetadata } from '@/lib/og-scraper';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

vi.mock('@/lib/og-scraper', () => ({ scrapeOgMetadata: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  RATE_LIMITS: { ogScrape: { endpoint: 'og-scrape', limit: 60, windowSeconds: 3600 } },
}));

const req = (body: unknown) => new NextRequest('https://urlist.test/api/og', {
  method: 'POST',
  body: JSON.stringify(body),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('POST /api/og', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientIp).mockReturnValue('1.2.3.4');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(scrapeOgMetadata).mockResolvedValue({ url: 'https://example.com/', ogTitle: 'Title', ogDescription: null, ogImage: null, ogSiteName: null });
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 60 });
    const res = await json(await POST(req({ url: 'https://example.com' })));
    expect(res.status).toBe(429);
  });

  it('returns 400 for missing or invalid URL', async () => {
    expect((await json(await POST(req({})))).status).toBe(400);
    expect((await json(await POST(req({ url: '' })))).status).toBe(400);
  });

  it('returns OG metadata on success', async () => {
    const res = await json(await POST(req({ url: 'example.com' })));
    expect(res.status).toBe(200);
    expect(res.body.ogTitle).toBe('Title');
    expect(scrapeOgMetadata).toHaveBeenCalledWith('https://example.com/');
  });

  it('returns 400 for URL that fails normalization', async () => {
    const res = await json(await POST(req({ url: 'javascript:alert(1)' })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_URL');
  });
});
