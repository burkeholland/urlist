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
    expect(res.body.error.code).toBe('LIST_NOT_FOUND');
    expect(res.body.error.message).toBe('No list exists with this ID.');
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
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Sign in');
  });

  it('returns 404 when list is not found', async () => {
    vi.mocked(getList).mockResolvedValue(null);
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10 }), ctx));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LIST_NOT_FOUND');
    expect(res.body.error.message).toBe('List does not exist.');
  });

  it("returns 403 when user doesn't own the list", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'other' } as any);
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10 }), ctx));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('You are not the owner of this list.');
  });

  it('returns 400 when updatedAt is missing', async () => {
    const res = await json(await PATCH(req('PATCH', { description: 'x' }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_UPDATED_AT');
  });

  it('returns 409 on optimistic concurrency conflict', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 9 }), ctx));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/modified since your last fetch/);
  });

  it('returns 400 for invalid URL in links', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [{ url: 'bad url', position: 0 }] }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_URL');
    expect(res.body.error.message).toBe('Invalid URL: bad url');
  });

  it('returns 400 when links array is empty', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [] }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_LINKS');
    expect(res.body.error.message).toBe('List must contain at least one link.');
  });

  it('returns updated listId and updatedAt on success', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, description: 'new', links: [{ id: 'a', url: 'example.com', position: 0 }] }), ctx));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ listId: 'list-1', updatedAt: 20 });
  });

  it('logs updates with description/links change flags', async () => {
    const { log } = await import('@/lib/logger');
    await json(await PATCH(req('PATCH', { updatedAt: 10, description: 'new', links: [{ id: 'a', url: 'example.com', position: 0 }] }), ctx));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      message: 'List updated',
      service: 'api-lists',
      data: { listId: 'list-1', hasDescriptionChange: true, hasLinksChange: true },
    }));
  });

  it('logs updates with false flags when nothing changed', async () => {
    const { log } = await import('@/lib/logger');
    await json(await PATCH(req('PATCH', { updatedAt: 10 }), ctx));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      data: { listId: 'list-1', hasDescriptionChange: false, hasLinksChange: false },
    }));
  });

  it('returns 400 for schema-invalid body that includes updatedAt', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [{ position: 0 }] }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(res.body.error.message).toBeTruthy();
  });

  it('returns 400 for a malformed body that has updatedAt but fails schema', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 'not-a-number' }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await json(await PATCH(new NextRequest('https://urlist.test/api/lists/list-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{no',
    }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_UPDATED_AT');
  });

  it('returns 400 when description exceeds 280 characters', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, description: 'x'.repeat(281) }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DESCRIPTION_TOO_LONG');
    expect(res.body.error.message).toBe('Description exceeds 280 characters.');
  });

  it('accepts a description of exactly 280 characters', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, description: 'x'.repeat(280) }), ctx));
    expect(res.status).toBe(200);
  });

  it('generates ids for new links without one', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [{ url: 'example.com', position: 0 }] }), ctx));
    expect(res.status).toBe(200);
    expect(updateList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ id: expect.any(String), url: 'https://example.com/' })],
    }));
  });

  it('defaults pinned to false and drops invalid ogImage in PATCH links', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [{ url: 'example.com', position: 0, ogImage: 'not a url' }] }), ctx));
    expect(res.status).toBe(200);
    expect(updateList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ pinned: false, ogImage: null })],
    }));
  });

  it('passes through explicitly pinned links in PATCH', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [{ url: 'example.com', position: 0, pinned: true }] }), ctx));
    expect(res.status).toBe(200);
    expect(updateList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ pinned: true })],
    }));
  });

  it('keeps a valid ogImage URL in PATCH links', async () => {
    const res = await json(await PATCH(req('PATCH', { updatedAt: 10, links: [{ url: 'example.com', position: 0, ogImage: 'https://cdn.example.com/img.png' }] }), ctx));
    expect(res.status).toBe(200);
    expect(updateList).toHaveBeenCalledWith(expect.objectContaining({
      links: [expect.objectContaining({ ogImage: 'https://cdn.example.com/img.png' })],
    }));
  });

  it('rethrows non-auth errors', async () => {
    vi.mocked(updateList).mockRejectedValue(new Error('db down'));
    await expect(PATCH(req('PATCH', { updatedAt: 10, description: 'x' }), ctx)).rejects.toThrow('db down');
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
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when list is not found', async () => {
    vi.mocked(getList).mockResolvedValue(null);
    const res = await json(await DELETE(req('DELETE'), ctx));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LIST_NOT_FOUND');
    expect(res.body.error.message).toBe('List does not exist.');
  });

  it("returns 403 when user doesn't own list", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'other' } as any);
    const res = await json(await DELETE(req('DELETE'), ctx));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('You are not the owner of this list.');
  });

  it('returns deleted true and listId on success', async () => {
    const res = await json(await DELETE(req('DELETE'), ctx));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, listId: 'list-1' });
    expect(deleteList).toHaveBeenCalledWith({ listId: 'list-1', slug: 's', ownerId: 'u1' });
  });

  it('logs deletions with the list metadata', async () => {
    const { log } = await import('@/lib/logger');
    await json(await DELETE(req('DELETE'), ctx));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      message: 'List deleted',
      service: 'api-lists',
      data: { listId: 'list-1', slug: 's' },
    }));
  });

  it('rethrows non-auth errors', async () => {
    vi.mocked(deleteList).mockRejectedValue(new Error('db down'));
    await expect(DELETE(req('DELETE'), ctx)).rejects.toThrow('db down');
  });
});
