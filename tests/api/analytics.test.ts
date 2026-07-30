import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  requireAuth: vi.fn(),
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, msg: string) { super(msg); this.code = code; this.name = 'AuthError'; }
  },
}));
vi.mock('@/lib/rtdb', () => ({ getUserListIds: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ getGlobalAnalytics: vi.fn() }));

import { GET } from '@/app/api/analytics/route';
import { verifyAuth, requireAuth, AuthError } from '@/lib/auth';
import { getUserListIds } from '@/lib/rtdb';
import { getGlobalAnalytics } from '@/lib/analytics';

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetUserListIds = getUserListIds as ReturnType<typeof vi.fn>;
const mockGetGlobalAnalytics = getGlobalAnalytics as ReturnType<typeof vi.fn>;

describe('GET /api/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({ authenticated: true, uid: 'user1' });
    mockRequireAuth.mockImplementation(() => {});
    mockGetUserListIds.mockResolvedValue(['l1', 'l2']);
    mockGetGlobalAnalytics.mockResolvedValue({ totalViews: 10 });
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockImplementation(() => {
      throw new (AuthError as unknown as new (code: string, msg: string) => Error)('UNAUTHORIZED', 'Missing or invalid auth token.');
    });
    const res = await GET(new NextRequest('http://localhost:3000/api/analytics'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns global analytics for the user lists', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/analytics'));
    expect(res.status).toBe(200);
    expect(mockGetUserListIds).toHaveBeenCalledWith('user1');
    expect(mockGetGlobalAnalytics).toHaveBeenCalledWith(['l1', 'l2'], undefined, undefined);
    const body = await res.json();
    expect(body.totalViews).toBe(10);
  });

  it('passes from/to date filters to getGlobalAnalytics', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/analytics?from=1000&to=2000'));
    expect(res.status).toBe(200);
    expect(mockGetGlobalAnalytics).toHaveBeenCalledWith(['l1', 'l2'], 1000, 2000);
  });

  it('rethrows non-auth errors', async () => {
    mockGetUserListIds.mockRejectedValue(new Error('db down'));
    await expect(GET(new NextRequest('http://localhost:3000/api/analytics'))).rejects.toThrow('db down');
  });
});
