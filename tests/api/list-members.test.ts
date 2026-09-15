import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, PATCH } from '@/app/api/lists/[listId]/members/[uid]/route';
import { GET } from '@/app/api/lists/[listId]/members/route';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { getList, getListMembership, getListMemberships, removeListMembership, updateListMembershipRole } from '@/lib/rtdb';

vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  requireAuth: vi.fn(),
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AuthError'; }
  },
}));
vi.mock('@/lib/rtdb', () => ({
  getList: vi.fn(),
  getListMembership: vi.fn(),
  getListMemberships: vi.fn(),
  updateListMembershipRole: vi.fn(),
  removeListMembership: vi.fn(),
}));

const list = { slug: 's', description: '', ownerId: 'owner', createdAt: 1, updatedAt: 1 };
const ctx = { params: Promise.resolve({ listId: 'list-1' }) };
const memberCtx = (uid = 'u2') => ({ params: Promise.resolve({ listId: 'list-1', uid }) });
const req = (method: string, body?: unknown) => new NextRequest('https://urlist.test/api/lists/list-1/members/u2', {
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('member management API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'owner' } as any);
    vi.mocked(requireAuth).mockImplementation(() => undefined);
    vi.mocked(getList).mockResolvedValue(list);
    vi.mocked(getListMembership).mockResolvedValue(null);
    vi.mocked(getListMemberships).mockResolvedValue([{ id: 'owner_list-1', uid: 'owner', listId: 'list-1', role: 'owner', createdAt: 1, updatedAt: 1 }]);
    vi.mocked(updateListMembershipRole).mockResolvedValue({ id: 'u2_list-1', uid: 'u2', listId: 'list-1', role: 'viewer', createdAt: 1, updatedAt: 2 });
    vi.mocked(removeListMembership).mockResolvedValue(true);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockImplementation(() => { throw new AuthError('UNAUTHORIZED', 'Sign in'); });
    const res = await json(await GET(req('GET'), ctx));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when list is missing', async () => {
    vi.mocked(getList).mockResolvedValue(null);
    const res = await json(await GET(req('GET'), ctx));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LIST_NOT_FOUND');
  });

  it.each([
    ['list members', () => GET(req('GET'), ctx)],
    ['change member roles', () => PATCH(req('PATCH', { role: 'viewer' }), memberCtx())],
    ['remove members', () => DELETE(req('DELETE'), memberCtx())],
  ])('forbids editor and viewer collaborators from %s', async (_action, call) => {
    for (const role of ['editor', 'viewer'] as const) {
      vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u3' });
      vi.mocked(getListMembership).mockResolvedValue({ id: 'u3_list-1', uid: 'u3', listId: 'list-1', role, createdAt: 1, updatedAt: 1 });
      const res = await json(await call());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('lists members for owners', async () => {
    const res = await json(await GET(req('GET'), ctx));
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
  });

  it('updates non-owner member roles', async () => {
    const res = await json(await PATCH(req('PATCH', { role: 'viewer' }), memberCtx()));
    expect(res.status).toBe(200);
    expect(updateListMembershipRole).toHaveBeenCalledWith({ listId: 'list-1', uid: 'u2', role: 'viewer' });
  });

  it('rejects attempts to change the owner role', async () => {
    const res = await json(await PATCH(req('PATCH', { role: 'viewer' }), memberCtx('owner')));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MEMBER_CHANGE');
  });

  it('rejects invalid role updates', async () => {
    const res = await json(await PATCH(req('PATCH', { role: 'owner' }), memberCtx()));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('removes members immediately', async () => {
    const res = await json(await DELETE(req('DELETE'), memberCtx()));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true, uid: 'u2' });
    expect(removeListMembership).toHaveBeenCalledWith('list-1', 'u2');
  });
});
