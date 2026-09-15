import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/capture/route';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { getDb } from '@/lib/cosmos';
import { getLinks } from '@/lib/rtdb';

vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  requireAuth: vi.fn(),
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock('@/lib/cosmos', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/rtdb', () => ({ getLinks: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    publishAuthenticated: { endpoint: 'publish-auth', limit: 100, windowSeconds: 3600 },
  },
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

const { checkRateLimit } = await import('@/lib/rate-limiter');

const req = (body: unknown) =>
  new NextRequest('https://urlist.test/api/capture', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const list = {
  id: 'list-1',
  slug: 'starter-kit',
  description: 'desc',
  ownerId: 'u1',
  createdAt: 1,
  updatedAt: 10,
  _etag: 'etag-1',
};

const existingLink = {
  id: 'link-1',
  url: 'https://example.com/',
  position: 0,
  pinned: false,
  ogTitle: 'Existing',
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  createdAt: 1,
};

describe('POST /api/capture', () => {
  const listRead = vi.fn();
  const listPatch = vi.fn();
  const linkCreate = vi.fn();
  const linkDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(() => undefined);
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u1' } as never);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
    vi.mocked(getLinks).mockResolvedValue([] as never);

    listRead.mockResolvedValue({ resource: list });
    listPatch.mockResolvedValue({});
    linkCreate.mockResolvedValue({});
    linkDelete.mockResolvedValue({});

    vi.mocked(getDb).mockReturnValue({
      container: vi.fn((name: string) => {
        if (name === 'lists') {
          return {
            item: () => ({
              read: listRead,
              patch: listPatch,
            }),
          };
        }

        if (name === 'links') {
          return {
            items: {
              create: linkCreate,
            },
            item: () => ({
              delete: linkDelete,
            }),
          };
        }

        throw new Error(`Unexpected container ${name}`);
      }),
    } as never);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAuth).mockImplementation(() => {
      throw new AuthError('UNAUTHORIZED', 'nope');
    });
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toBe('Sign in to save links to your lists.');
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 60 } as never);
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'https://example.com' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  it('returns 400 for invalid requests', async () => {
    const res = await POST(req({ listId: 'list-1', updatedAt: 'bad', url: 'https://example.com' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for invalid URLs', async () => {
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'not a url' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_URL');
  });

  it('returns 404 when the list does not exist', async () => {
    listRead.mockResolvedValue({ resource: null });
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'https://example.com' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('LIST_NOT_FOUND');
  });

  it('returns 403 when the user does not own the list', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u2' } as never);
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'https://example.com' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });

  it('returns 409 for stale list conflicts before writing', async () => {
    const res = await POST(req({ listId: 'list-1', updatedAt: 9, url: 'https://example.com' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CONFLICT');
  });

  it('compensates the created link when the conditional list patch detects a race', async () => {
    listPatch.mockRejectedValue(Object.assign(new Error('precondition failed'), { code: 412 }));
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'https://example.com/race' }));
    expect(res.status).toBe(409);
    expect(linkDelete).toHaveBeenCalledTimes(1);
    expect((await res.json()).error.code).toBe('CONFLICT');
  });

  it('returns 409 for duplicates until explicitly allowed', async () => {
    vi.mocked(getLinks).mockResolvedValue([existingLink] as never);
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'https://example.com' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('DUPLICATE_URL');
    expect(body.duplicate.linkId).toBe('link-1');
  });

  it('allows duplicates when explicitly requested', async () => {
    vi.mocked(getLinks).mockResolvedValue([existingLink] as never);
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'https://example.com', duplicateAction: 'allow' }));
    expect(res.status).toBe(201);
    expect(linkCreate).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/' }));
    expect(listPatch).toHaveBeenCalledWith(
      [{ op: 'set', path: '/updatedAt', value: expect.any(Number) }],
      { accessCondition: { type: 'IfMatch', condition: 'etag-1' } },
    );
  });

  it('succeeds without OG metadata so preview failures do not block capture', async () => {
    const res = await POST(req({ listId: 'list-1', updatedAt: 10, url: 'example.com' }));
    expect(res.status).toBe(201);
    expect(linkCreate).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/',
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogSiteName: null,
    }));
  });

  it('sanitizes metadata before saving', async () => {
    const res = await POST(req({
      listId: 'list-1',
      updatedAt: 10,
      url: 'https://example.com',
      ogTitle: '<b>Hello</b>',
      ogDescription: '<i>World</i>',
      ogImage: 'javascript:alert(1)',
      ogSiteName: 'Site',
    }));
    expect(res.status).toBe(201);
    expect(linkCreate).toHaveBeenCalledWith(expect.objectContaining({
      ogTitle: 'Hello',
      ogDescription: 'World',
      ogImage: null,
      ogSiteName: 'Site',
    }));
  });
});
