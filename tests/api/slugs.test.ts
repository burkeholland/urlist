import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/slugs/[slug]/route';
import { isSlugAvailable } from '@/lib/rtdb';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

vi.mock('@/lib/rtdb', () => ({ isSlugAvailable: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  RATE_LIMITS: { slugCheck: { endpoint: 'slug-check', limit: 120, windowSeconds: 3600 } },
}));

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('GET /api/slugs/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientIp).mockReturnValue('1.2.3.4');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(isSlugAvailable).mockResolvedValue(true);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 60 });
    const res = await GET(new NextRequest('https://urlist.test/api/slugs/s'), ctx('s'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.message).toBe('Too many requests. Please try again later.');
    expect(body.error.retryAfter).toBe(60);
  });

  it('returns 400 for invalid slug format', async () => {
    const res = await json(await GET(new NextRequest('https://urlist.test/api/slugs/Bad'), ctx('Bad')));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SLUG_FORMAT');
    expect(res.body.error.message).toMatch(/lowercase/i);
  });

  it('returns available true when available', async () => {
    const res = await json(await GET(new NextRequest('https://urlist.test/api/slugs/free'), ctx('free')));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slug: 'free', available: true });
  });

  it('returns available false when taken', async () => {
    vi.mocked(isSlugAvailable).mockResolvedValue(false);
    const res = await json(await GET(new NextRequest('https://urlist.test/api/slugs/taken'), ctx('taken')));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slug: 'taken', available: false });
  });
});
