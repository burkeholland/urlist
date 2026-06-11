import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH } from '@/app/api/lists/[listId]/route';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { deleteList, getList, getListWithLinks, updateList } from '@/lib/rtdb';

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
vi.mock('@/lib/rtdb', () => ({ getList: vi.fn(), getListWithLinks: vi.fn(), updateList: vi.fn(), deleteList: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

const ctx = { params: Promise.resolve({ listId: 'list-1' }) };
const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const req = (method: string, body?: unknown) => new NextRequest('https://urlist.test/api/lists/list-1', {
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
const list = { slug: 's', description: '', ownerId: 'u1', createdAt: 1, updatedAt: 10 };

describe('GET /api/lists/[listId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when list is not found', async () => {
    vi.mocked(getListWithLinks).mockResolvedValue(null);
    const res = await json(await GET(req('GET'), ctx));
    expect(res.status).toBe(404);
  });

  it('returns list with links when found', async () => {
    vi.mocked(getListWithLinks).mockResolvedValue({ listId: 'list-1', ...list, links: [] });
    const res = await json(await GET(req('GET'), ctx));
    expect(res.status).toBe(200);
    expect(res.body.listId).toBe('list-1');
  });
});

describe('PATCH /api/lists/[listId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(() => undefined);
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u1' } as any);
    vi.mocked(getList).mockResolvedValue(list);
    vi.mocked(updateList).mockResolvedValue(20);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAuth).mockImplementation(() => {
      throw new AuthError('UNAUTHORIZED', 'Sign in');
    });
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10 }), ctx));
    expect(res.status).toBe(401);
  });

  it('returns 404 when list is not found', async () => {
    vi.mocked(getList).mockResolvedValue(null);
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10 }), ctx));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user doesn't own the list", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'other' } as any);
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10 }), ctx));
    expect(res.status).toBe(403);
  });

  it('returns 400 when updatedAt is missing', async () => {
    const res = await json(await PATCH(req('PATCH', { description: 'x' }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_UPDATED_AT');
  });

  it('returns 409 on optimistic concurrency conflict', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 9 }), ctx));
    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid URL in links', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [{ url: 'bad url', position: 0 }] }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_URL');
  });

  it('returns 400 when links array is empty', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [] }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_LINKS');
  });

  it('returns updated listId and updatedAt on success', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, description: 'new', links: [{ id: 'a', url: 'example.com', position: 0 }] }), ctx));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listId: 'list-1', updatedAt: 20 });
  });
});

describe('DELETE /api/lists/[listId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(() => undefined);
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u1' } as any);
    vi.mocked(getList).mockResolvedValue(list);
    vi.mocked(deleteList).mockResolvedValue();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(requireAuth).mockImplementation(() => {
      throw new AuthError('UNAUTHORIZED', 'Sign in');
    });
    const res = await json(await DELETE(req('DELETE'), ctx));
    expect(res.status).toBe(401);
  });

  it('returns 404 when list is not found', async () => {
    vi.mocked(getList).mockResolvedValue(null);
    const res = await json(await DELETE(req('DELETE'), ctx));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user doesn't own list", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'other' } as any);
    const res = await json(await DELETE(req('DELETE'), ctx));
    expect(res.status).toBe(403);
  });

  it('returns deleted true and listId on success', async () => {
    const res = await json(await DELETE(req('DELETE'), ctx));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, listId: 'list-1' });
  });
});
