import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/me/route';
import { getSessionUser } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({ getSessionUser: vi.fn() }));

const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user null when no session exists', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await json(await GET(new NextRequest('https://urlist.test/api/auth/me')));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  it('returns user when authenticated', async () => {
    const user = { uid: 'u1', username: 'octo', name: 'Octo', avatar: 'https://example.com/a.png' };
    vi.mocked(getSessionUser).mockResolvedValue(user);
    const res = await json(await GET(new NextRequest('https://urlist.test/api/auth/me')));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user });
  });
});
