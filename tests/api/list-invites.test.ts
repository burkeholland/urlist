import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/lists/[listId]/invites/route';
import { DELETE } from '@/app/api/lists/[listId]/invites/[inviteId]/route';
import { POST as ROTATE } from '@/app/api/lists/[listId]/invites/[inviteId]/rotate/route';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { createInvite, getList, getListMembership, listInvites, revokeInvite, rotateInvite } from '@/lib/rtdb';

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
  createInvite: vi.fn(),
  listInvites: vi.fn(),
  revokeInvite: vi.fn(),
  rotateInvite: vi.fn(),
}));

const list = { slug: 's', description: '', ownerId: 'owner', createdAt: 1, updatedAt: 1 };
const invite = { id: 'inv_1', type: 'invite' as const, listId: 'list-1', role: 'editor' as const, createdAt: 1, createdBy: 'owner', expiresAt: 9999 };
const ctx = { params: Promise.resolve({ listId: 'list-1' }) };
const inviteCtx = { params: Promise.resolve({ listId: 'list-1', inviteId: 'inv_1' }) };
const req = (method: string, body?: unknown) => new NextRequest('https://urlist.test/api/lists/list-1/invites', {
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('invite management API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'owner' } as any);
    vi.mocked(requireAuth).mockImplementation(() => undefined);
    vi.mocked(getList).mockResolvedValue(list);
    vi.mocked(getListMembership).mockResolvedValue(null);
    vi.mocked(listInvites).mockResolvedValue([invite]);
    vi.mocked(createInvite).mockResolvedValue({ invite, token: 'tok_abcdefghijklmnopqrstuvwxyz0123456789' });
    vi.mocked(revokeInvite).mockResolvedValue({ ...invite, revokedAt: 10, revokedBy: 'owner' });
    vi.mocked(rotateInvite).mockResolvedValue({ invite: { ...invite, id: 'inv_2', rotatedFrom: 'inv_1' }, token: 'tok_rotatedabcdefghijklmnopqrstuvwxyz0123456789' });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockImplementation(() => { throw new AuthError('UNAUTHORIZED', 'Sign in'); });
    const res = await json(await GET(req('GET'), ctx));
    expect(res.status).toBe(401);
  });

  it.each([
    ['list invites', () => GET(req('GET'), ctx)],
    ['create invites', () => POST(req('POST', { role: 'editor' }), ctx)],
    ['revoke invites', () => DELETE(req('DELETE'), inviteCtx)],
    ['rotate invites', () => ROTATE(req('POST', { expiresInDays: 5 }), inviteCtx)],
  ])('forbids editor and viewer collaborators from %s', async (_action, call) => {
    for (const role of ['editor', 'viewer'] as const) {
      vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u2' });
      vi.mocked(getListMembership).mockResolvedValue({ id: 'u2_list-1', uid: 'u2', listId: 'list-1', role, createdAt: 1, updatedAt: 1 });
      const res = await json(await call());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('lists safe invite metadata without token hashes', async () => {
    const res = await json(await GET(req('GET'), ctx));
    expect(res.status).toBe(200);
    expect(res.body.invites).toEqual([invite]);
    expect(JSON.stringify(res.body)).not.toContain('tokenHash');
  });

  it('creates owner invite links with fragment tokens', async () => {
    const res = await json(await POST(req('POST', { role: 'viewer', expiresInDays: 3 }), ctx));
    expect(res.status).toBe(201);
    expect(createInvite).toHaveBeenCalledWith({ listId: 'list-1', role: 'viewer', expiresInDays: 3, createdBy: 'owner' });
    expect(res.body.inviteUrl).toContain('/app/invites/accept#token=');
    expect(JSON.stringify(res.body.invite)).not.toContain('tokenHash');
  });

  it('rejects owner invite roles', async () => {
    const res = await json(await POST(req('POST', { role: 'owner' }), ctx));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('revokes invites', async () => {
    const res = await json(await DELETE(req('DELETE'), inviteCtx));
    expect(res.status).toBe(200);
    expect(revokeInvite).toHaveBeenCalledWith({ listId: 'list-1', inviteId: 'inv_1', actorId: 'owner' });
  });

  it('rotates invites and returns a fresh fragment token URL', async () => {
    const res = await json(await ROTATE(req('POST', { expiresInDays: 5 }), inviteCtx));
    expect(res.status).toBe(201);
    expect(rotateInvite).toHaveBeenCalledWith({ listId: 'list-1', inviteId: 'inv_1', actorId: 'owner', expiresInDays: 5 });
    expect(res.body.invite.id).toBe('inv_2');
    expect(res.body.inviteUrl).toContain('/app/invites/accept#token=');
  });
});
