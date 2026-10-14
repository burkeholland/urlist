import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/invites/accept/route';
import { getSessionUser } from '@/lib/auth';
import { acceptInvite } from '@/lib/rtdb';

vi.mock('@/lib/auth', () => ({ getSessionUser: vi.fn() }));
vi.mock('@/lib/rtdb', () => ({ acceptInvite: vi.fn() }));

const user = { uid: 'u2', username: 'octo', name: 'Octo', avatar: 'https://github.com/octo.png' };
const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
const req = (body: unknown) => new NextRequest('https://urlist.test/api/invites/accept', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('POST /api/invites/accept', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue(user);
    vi.mocked(acceptInvite).mockResolvedValue({ status: 'accepted', listId: 'list-1', role: 'viewer', slug: 's' });
  });

  it('requires a signed-in user', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await json(await POST(req({ token })));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed tokens before lookup', async () => {
    const res = await json(await POST(req({ token: 'bad token!' })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('accepts a valid invite', async () => {
    const res = await json(await POST(req({ token })));
    expect(res.status).toBe(200);
    expect(acceptInvite).toHaveBeenCalledWith({ token, user });
    expect(res.body).toEqual({ listId: 'list-1', role: 'viewer', slug: 's' });
  });

  it.each([
    ['invalid', 404, 'INVALID_INVITE'],
    ['expired', 410, 'INVITE_EXPIRED'],
    ['revoked', 410, 'INVITE_REVOKED'],
    ['used', 409, 'INVITE_USED'],
    ['list_not_found', 404, 'LIST_NOT_FOUND'],
  ] as const)('maps %s invite failures', async (status, httpStatus, code) => {
    vi.mocked(acceptInvite).mockResolvedValue({ status });
    const res = await json(await POST(req({ token })));
    expect(res.status).toBe(httpStatus);
    expect(res.body.error.code).toBe(code);
  });
});
