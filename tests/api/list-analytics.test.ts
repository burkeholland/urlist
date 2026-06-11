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
vi.mock('@/lib/rtdb', () => ({
  getList: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({
  getListAnalytics: vi.fn(),
}));

import { GET } from '@/app/api/lists/[listId]/analytics/route';
import { verifyAuth, requireAuth, AuthError } from '@/lib/auth';
import { getList } from '@/lib/rtdb';
import { getListAnalytics } from '@/lib/analytics';

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetList = getList as ReturnType<typeof vi.fn>;
const mockGetListAnalytics = getListAnalytics as ReturnType<typeof vi.fn>;

const params = { params: Promise.resolve({ listId: 'list123' }) };

describe('GET /api/lists/[listId]/analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({ authenticated: true, uid: 'user1' });
    mockRequireAuth.mockImplementation(() => {});
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockImplementation(() => {
      throw new (AuthError as unknown as new (code: string, msg: string) => Error)('UNAUTHORIZED', 'Missing or invalid auth token.');
    });
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics');
    const res = await GET(req, params);
    expect(res.status).toBe(401);
  });

  it('returns 404 when list not found', async () => {
    mockGetList.mockResolvedValue(null);
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics');
    const res = await GET(req, params);
    expect(res.status).toBe(404);
  });

  it('returns 403 when user does not own the list', async () => {
    mockGetList.mockResolvedValue({ slug: 'test', ownerId: 'other-user', updatedAt: 1000 });
    mockVerifyAuth.mockResolvedValue({ authenticated: true, uid: 'user1' });
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics');
    const res = await GET(req, params);
    expect(res.status).toBe(403);
  });

  it('returns analytics data for owned list', async () => {
    mockGetList.mockResolvedValue({ slug: 'test', ownerId: 'user1', updatedAt: 1000 });
    const mockAnalytics = { listId: 'list123', totalViews: 42, uniqueVisitors: 10, totalClicks: 5, clickThroughRate: 0.12, viewsOverTime: [], topReferrers: [], geoBreakdown: [], linkClicks: [] };
    mockGetListAnalytics.mockResolvedValue(mockAnalytics);
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics');
    const res = await GET(req, params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalViews).toBe(42);
  });

  it('passes from/to date filters to getListAnalytics', async () => {
    mockGetList.mockResolvedValue({ slug: 'test', ownerId: 'user1', updatedAt: 1000 });
    mockGetListAnalytics.mockResolvedValue({ totalViews: 0 });
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics?from=1000&to=2000');
    const res = await GET(req, params);
    expect(res.status).toBe(200);
    expect(mockGetListAnalytics).toHaveBeenCalledWith('test', 'list123', 1000, 2000);
  });
});
