import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/lists/[listId]/duplicate/route';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { cleanupFailedPublish, createList, getListWithLinks, reserveSlug } from '@/lib/rtdb';
import { generateLinkId, generateListId, generateSlug } from '@/lib/slug';

vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  requireAuth: vi.fn(),
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
      this.name = 'AuthError';
    }
  },
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    publishAuthenticated: { endpoint: 'publish-auth', limit: 100, windowSeconds: 3600 },
  },
}));
vi.mock('@/lib/rtdb', () => ({
  cleanupFailedPublish: vi.fn(),
  createList: vi.fn(),
  getListWithLinks: vi.fn(),
  reserveSlug: vi.fn(),
}));
vi.mock('@/lib/slug', () => ({
  generateLinkId: vi.fn(),
  generateListId: vi.fn(),
  generateSlug: vi.fn(),
  validateSlugFormat: vi.fn((slug: string) => (
    slug === 'Bad Slug'
      ? { valid: false, error: 'Slug contains invalid characters.' }
      : { valid: true }
  )),
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

const ctx = { params: Promise.resolve({ listId: 'source-list' }) };
const req = (body?: unknown) => new NextRequest('https://urlist.test/api/lists/source-list/duplicate', {
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const source = {
  listId: 'source-list',
  slug: 'source',
  description: 'Source desc',
  ownerId: 'source-owner',
  createdAt: 1,
  updatedAt: 2,
  links: [
    {
      id: 'old-b',
      url: 'https://b.example.com/',
      position: 1,
      pinned: false,
      folder: null,
      ogTitle: 'B',
      ogDescription: null,
      ogImage: null,
      ogSiteName: null,
      createdAt: 1,
    },
    {
      id: 'old-a',
      url: 'https://a.example.com/',
      position: 0,
      pinned: true,
      folder: 'Folder',
      ogTitle: 'A',
      ogDescription: 'Desc',
      ogImage: 'https://cdn.example.com/a.png',
      ogSiteName: 'Site',
      createdAt: 1,
    },
  ],
};

describe('POST /api/lists/[listId]/duplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u1' });
    vi.mocked(requireAuth).mockImplementation(() => undefined);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(getListWithLinks).mockResolvedValue(source);
    vi.mocked(reserveSlug).mockResolvedValue(true);
    vi.mocked(createList).mockResolvedValue();
    vi.mocked(cleanupFailedPublish).mockResolvedValue();
    vi.mocked(generateListId).mockReturnValue('new-list');
    vi.mocked(generateSlug).mockReturnValue('new-slug');
    vi.mocked(generateLinkId)
      .mockReturnValueOnce('new-a')
      .mockReturnValueOnce('new-b');
  });

  it('requires authentication', async () => {
    vi.mocked(requireAuth).mockImplementation(() => {
      throw new AuthError('UNAUTHORIZED', 'Sign in');
    });
    const res = await json(await POST(req({}), ctx));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rate limits duplicate creation', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 30 });
    const res = await json(await POST(req({}), ctx));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.body.error.retryAfter).toBe(30);
  });

  it('returns 404 when the source list is missing', async () => {
    vi.mocked(getListWithLinks).mockResolvedValue(null);
    const res = await json(await POST(req({}), ctx));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LIST_NOT_FOUND');
  });

  it('creates a safe duplicate with new list/link IDs, owner, slug, and deterministic link order', async () => {
    const res = await json(await POST(req(), ctx));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ listId: 'new-list', slug: 'new-slug', publicUrl: '/new-slug' });
    expect(reserveSlug).toHaveBeenCalledWith('new-slug', 'new-list');
    expect(createList).toHaveBeenCalledWith({
      listId: 'new-list',
      slug: 'new-slug',
      description: 'Source desc',
      ownerId: 'u1',
      links: [
        expect.objectContaining({
          id: 'new-a',
          url: 'https://a.example.com/',
          position: 0,
          pinned: true,
          folder: 'Folder',
        }),
        expect.objectContaining({
          id: 'new-b',
          url: 'https://b.example.com/',
          position: 1,
          pinned: false,
          folder: null,
        }),
      ],
    });
    expect(JSON.stringify(vi.mocked(createList).mock.calls[0][0])).not.toContain('source-owner');
    expect(JSON.stringify(vi.mocked(createList).mock.calls[0][0])).not.toContain('old-a');
  });

  it('uses and validates custom duplicate slugs', async () => {
    const res = await json(await POST(req({ slug: 'copy' }), ctx));
    expect(res.status).toBe(201);
    expect(reserveSlug).toHaveBeenCalledWith('copy', 'new-list');

    const invalid = await json(await POST(req({ slug: 'Bad Slug' }), ctx));
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_SLUG_FORMAT');
  });

  it('returns 409 for taken custom slugs', async () => {
    vi.mocked(reserveSlug).mockResolvedValue(false);
    const res = await json(await POST(req({ slug: 'copy' }), ctx));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  it('returns 400 for malformed JSON and too-long descriptions', async () => {
    const malformed = await json(await POST(new NextRequest('https://urlist.test/api/lists/source-list/duplicate', {
      method: 'POST',
      body: '{no',
    }), ctx));
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_REQUEST');

    const longDescription = await json(await POST(req({ description: 'x'.repeat(281) }), ctx));
    expect(longDescription.status).toBe(400);
    expect(longDescription.body.error.code).toBe('DESCRIPTION_TOO_LONG');
  });

  it('returns 500 when generated slugs cannot be reserved', async () => {
    vi.mocked(reserveSlug).mockResolvedValue(false);
    const res = await json(await POST(req({}), ctx));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('SLUG_GENERATION_FAILED');
    expect(reserveSlug).toHaveBeenCalledTimes(5);
  });

  it('cleans up reserved artifacts when duplicate creation fails', async () => {
    vi.mocked(createList).mockRejectedValue(new Error('db down'));
    await expect(POST(req({}), ctx)).rejects.toThrow('db down');
    expect(cleanupFailedPublish).toHaveBeenCalledWith({
      listId: 'new-list',
      slug: 'new-slug',
      ownerId: 'u1',
    });
  });
});
