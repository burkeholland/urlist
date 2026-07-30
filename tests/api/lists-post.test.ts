import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/lists/route';
import { verifyAuth } from '@/lib/auth';
import { cleanupFailedPublish, createList, reserveSlug } from '@/lib/rtdb';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

vi.mock('@/lib/auth', () => ({ verifyAuth: vi.fn() }));
vi.mock('@/lib/rtdb', () => ({
  reserveSlug: vi.fn(),
  createList: vi.fn(),
  cleanupFailedPublish: vi.fn(),
  getUserListIds: vi.fn(),
  getListsWithLinks: vi.fn(),
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  RATE_LIMITS: {
    publishAnonymous: { endpoint: 'publish-anon', limit: 10, windowSeconds: 3600 },
    publishAuthenticated: { endpoint: 'publish-auth', limit: 100, windowSeconds: 3600 },
  },
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

const req = (body: unknown) => new NextRequest('https://urlist.test/api/lists', {
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const validBody = { slug: 'my-list', description: 'desc', links: [{ url: 'example.com', position: 0 }] };
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('POST /api/lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientIp).mockReturnValue('1.2.3.4');
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u1', user: { uid: 'u1', login: 'octo', name: null, avatarUrl: null } } as any);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(reserveSlug).mockResolvedValue(true);
    vi.mocked(createList).mockResolvedValue();
    vi.mocked(cleanupFailedPublish).mockResolvedValue();
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 60 });
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.message).toBe('Too many publish requests. Try again later.');
    expect(body.error.retryAfter).toBe(60);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await json(await POST(req('{no')));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(res.body.error.message).toBeTruthy();
  });

  it('returns 400 when no links are provided', async () => {
    const res = await json(await POST(req({ links: [] })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_LINKS');
    expect(res.body.error.message).toMatch(/at least/);
  });

  it('returns 400 when links exceed 500', async () => {
    const res = await json(await POST(req({ links: Array.from({ length: 501 }, (_, i) => ({ url: 'example.com', position: i })) })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_LINKS');
  });

  it('returns 400 for invalid URL in links', async () => {
    const res = await json(await POST(req({ links: [{ url: 'not a url', position: 0 }] })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_URL');
    expect(res.body.error.message).toBe('Invalid URL: not a url');
  });

  it('returns 400 for invalid slug format', async () => {
    const res = await json(await POST(req({ ...validBody, slug: 'Bad Slug' })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SLUG_FORMAT');
  });

  it('returns 409 when custom slug is taken', async () => {
    vi.mocked(reserveSlug).mockResolvedValue(false);
    const res = await json(await POST(req(validBody)));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
    expect(res.body.error.message).toContain("'my-list'");
  });

  it('returns 201 with listId, slug, and publicUrl on authenticated success', async () => {
    const res = await json(await POST(req(validBody)));
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('my-list');
    expect(res.body.publicUrl).toBe('/my-list');
    expect(res.body.listId).toEqual(expect.any(String));
    expect(createList).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u1', slug: 'my-list' }));
  });

  it('logs the publish with list metadata', async () => {
    const { log } = await import('@/lib/logger');
    const res = await json(await POST(req(validBody)));
    expect(res.status).toBe(201);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      message: 'List published',
      service: 'api-lists',
      data: expect.objectContaining({ slug: 'my-list', linkCount: 1, anonymous: false }),
    }));
  });

  it('logs anonymous publishes as anonymous', async () => {
    const { log } = await import('@/lib/logger');
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: false } as any);
    const res = await json(await POST(req({ links: [{ url: 'example.com', position: 0 }] })));
    expect(res.status).toBe(201);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ anonymous: true }),
    }));
  });

  it('returns 201 for anonymous publish with an auto-generated slug', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: false } as any);
    const res = await json(await POST(req({ links: [{ url: 'example.com', position: 0 }] })));
    expect(res.status).toBe(201);
    expect(res.body.slug).toEqual(expect.any(String));
    expect(createList).toHaveBeenCalledWith(expect.objectContaining({ ownerId: undefined }));
  });

  it('returns 400 when description exceeds 280 characters', async () => {
    const res = await json(await POST(req({ ...validBody, description: 'x'.repeat(281) })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DESCRIPTION_TOO_LONG');
    expect(res.body.error.message).toBe('Description exceeds 280 characters.');
  });

  it('accepts a description of exactly 280 characters', async () => {
    const res = await json(await POST(req({ ...validBody, description: 'x'.repeat(280) })));
    expect(res.status).toBe(201);
  });

  it('returns 400 with INVALID_REQUEST for schema errors outside links', async () => {
    const res = await json(await POST(req({ links: [{ url: 'example.com', position: 0 }], slug: 42 })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 with INVALID_REQUEST when links field is missing', async () => {
    const res = await json(await POST(req({ description: 'x' })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('defaults pinned to false when omitted and drops invalid ogImage values', async () => {
    const res = await json(await POST(req({
      slug: 'og-test',
      description: '',
      links: [{ url: 'example.com', position: 0, ogImage: 'not a url' }],
    })));
    expect(res.status).toBe(201);
    expect(createList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ ogImage: null })],
    }));
  });

  it('passes through explicitly pinned links', async () => {
    const res = await json(await POST(req({
      slug: 'pinned-test',
      description: '',
      links: [{ url: 'example.com', position: 0, pinned: true }],
    })));
    expect(res.status).toBe(201);
    expect(createList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ pinned: true })],
    }));
  });

  it('defaults pinned to false when omitted in POST', async () => {
    const res = await json(await POST(req({
      slug: 'unpinned-test',
      description: '',
      links: [{ url: 'example.com', position: 0 }],
    })));
    expect(res.status).toBe(201);
    expect(createList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ pinned: false })],
    }));
  });

  it('keeps a valid ogImage URL', async () => {
    const res = await json(await POST(req({
      slug: 'og-img',
      description: '',
      links: [{ url: 'example.com', position: 0, ogImage: 'https://cdn.example.com/img.png' }],
    })));
    expect(res.status).toBe(201);
    expect(createList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ ogImage: 'https://cdn.example.com/img.png' })],
    }));
  });

  it('returns 500 when auto-generated slug reservation keeps failing', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: false } as any);
    vi.mocked(reserveSlug).mockResolvedValue(false);
    const res = await json(await POST(req({ links: [{ url: 'example.com', position: 0 }] })));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SLUG_GENERATION_FAILED');
    expect(reserveSlug).toHaveBeenCalledTimes(5);
  });

  it('calls cleanupFailedPublish on createList failure', async () => {
    vi.mocked(createList).mockRejectedValue(new Error('db down'));
    await expect(POST(req(validBody))).rejects.toThrow('db down');
    expect(cleanupFailedPublish).toHaveBeenCalledWith(expect.objectContaining({ slug: 'my-list', ownerId: 'u1' }));
  });

  it('logs the compensation on createList failure', async () => {
    const { log } = await import('@/lib/logger');
    vi.mocked(createList).mockRejectedValue(new Error('db down'));
    await expect(POST(req(validBody))).rejects.toThrow('db down');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      message: 'List creation failed, artifacts compensated',
      service: 'api-lists',
      data: expect.objectContaining({ slug: 'my-list', error: 'Error: db down' }),
    }));
  });
});
