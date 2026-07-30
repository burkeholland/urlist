import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/lists/route';
import { verifyAuth } from '@/lib/auth';
import { getUserListIds, getListsWithLinks } from '@/lib/rtdb';
import { getListAnalyticsSummary } from '@/lib/analytics';

vi.mock('@/lib/auth', () => ({ verifyAuth: vi.fn() }));
vi.mock('@/lib/rtdb', () => ({
  reserveSlug: vi.fn(),
  createList: vi.fn(),
  cleanupFailedPublish: vi.fn(),
  getUserListIds: vi.fn(),
  getListsWithLinks: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({ getListAnalyticsSummary: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn(), getClientIp: vi.fn(), RATE_LIMITS: {} }));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('GET /api/lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: 'u1' } as any);
    vi.mocked(getUserListIds).mockResolvedValue(['list-1']);
    vi.mocked(getListsWithLinks).mockResolvedValue([{ listId: 'list-1', slug: 's', description: '', ownerId: 'u1', createdAt: 1, updatedAt: 2, links: [] }]);
    vi.mocked(getListAnalyticsSummary).mockResolvedValue({ totalViews: 3, totalClicks: 4 } as any);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: false } as any);
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists')));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Sign in to view your lists.');
  });

  it('returns 401 when authenticated but uid is missing', async () => {
    vi.mocked(verifyAuth).mockResolvedValue({ authenticated: true, uid: null } as any);
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists')));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns plain lists when includeStats is not exactly "true"', async () => {
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists?includeStats=1')));
    expect(res.status).toBe(200);
    expect(res.body[0].stats).toBeUndefined();
    expect(getListAnalyticsSummary).not.toHaveBeenCalled();
  });

  it("returns the user's lists when authenticated", async () => {
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists')));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(getUserListIds).toHaveBeenCalledWith('u1');
  });

  it('includes stats when includeStats=true', async () => {
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists?includeStats=true')));
    expect(res.status).toBe(200);
    expect(res.body[0].stats).toEqual({ totalViews: 3, totalClicks: 4 });
    expect(getListAnalyticsSummary).toHaveBeenCalledWith('s');
  });

  it('falls back to zero stats when summary fetch fails', async () => {
    vi.mocked(getListAnalyticsSummary).mockRejectedValue(new Error('boom'));
    const res = await json(await GET(new NextRequest('https://urlist.test/api/lists?includeStats=true')));
    expect(res.status).toBe(200);
    expect(res.body[0].stats).toEqual({ totalViews: 0, totalClicks: 0 });
  });
});
