import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as POSTLinkHealthJob } from '@/app/api/link-health/route';
import { POST as POSTLinkHealthAction } from '@/app/api/lists/[listId]/links/[linkId]/health/route';
import { verifyAuth, requireAuth, AuthError } from '@/lib/auth';
import { checkLinkHealth } from '@/lib/link-health';
import { getList, getListsWithLinks, getListWithLinks, getUserListIds, updateLinkHealth } from '@/lib/rtdb';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import type { AuthResult } from '@/lib/auth';
import type { ListWithLinks } from '@/lib/types';

vi.mock('@/lib/auth', () => ({
  verifyAuth: vi.fn(),
  requireAuth: vi.fn(),
  AuthError: class AuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'AuthError';
    }
  },
}));
vi.mock('@/lib/link-health', async () => {
  const actual = await vi.importActual<typeof import('@/lib/link-health')>('@/lib/link-health');
  return {
    ...actual,
    checkLinkHealth: vi.fn(),
  };
});
vi.mock('@/lib/rtdb', () => ({
  getList: vi.fn(),
  getListWithLinks: vi.fn(),
  getListsWithLinks: vi.fn(),
  getUserListIds: vi.fn(),
  updateLinkHealth: vi.fn(),
}));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  RATE_LIMITS: {
    linkHealthManual: { endpoint: 'link-health-manual', limit: 120, windowSeconds: 3600 },
    linkHealthJob: { endpoint: 'link-health-job', limit: 12, windowSeconds: 3600 },
    linkHealthDestination: { endpoint: 'link-health-destination', limit: 1, windowSeconds: 60 },
  },
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

const link = {
  id: 'link-1',
  url: 'https://example.com/',
  position: 0,
  pinned: false,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  createdAt: 1,
};
const healthUpdate = {
  healthStatus: 'healthy' as const,
  healthReason: 'ok' as const,
  healthCheckedAt: 100,
  healthFinalUrl: 'https://example.com/',
  healthHttpStatus: 200,
  healthFailureCount: 0,
  healthNextCheckAt: 200,
  metadataRefreshedAt: 100,
  metadataRefreshStatus: 'updated' as const,
  ogTitle: 'Fresh',
};
const authenticated: AuthResult = { authenticated: true, uid: 'u1' };
const unauthenticated: AuthResult = { authenticated: false, uid: null };

const json = async (res: Response) => ({ status: res.status, body: await res.json() });
const req = (url: string, body: unknown = {}) => new NextRequest(url, {
  method: 'POST',
  body: JSON.stringify(body),
});

describe('POST /api/lists/[listId]/links/[linkId]/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(authenticated);
    vi.mocked(requireAuth).mockImplementation(() => undefined);
    vi.mocked(getClientIp).mockReturnValue('1.2.3.4');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(getList).mockResolvedValue({ slug: 's', description: '', ownerId: 'u1', createdAt: 1, updatedAt: 2 });
    vi.mocked(getListWithLinks).mockResolvedValue({ listId: 'list-1', slug: 's', description: '', ownerId: 'u1', createdAt: 1, updatedAt: 2, links: [link] });
    vi.mocked(checkLinkHealth).mockResolvedValue(healthUpdate);
    vi.mocked(updateLinkHealth).mockResolvedValue();
  });

  it('requires authentication', async () => {
    vi.mocked(requireAuth).mockImplementation(() => {
      throw new AuthError('UNAUTHORIZED', 'Sign in');
    });

    const res = await json(await POSTLinkHealthAction(
      req('https://urlist.test/api/lists/list-1/links/link-1/health'),
      { params: Promise.resolve({ listId: 'list-1', linkId: 'link-1' }) },
    ));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when the user is not the owner', async () => {
    vi.mocked(getList).mockResolvedValue({ slug: 's', description: '', ownerId: 'other', createdAt: 1, updatedAt: 2 });

    const res = await json(await POSTLinkHealthAction(
      req('https://urlist.test/api/lists/list-1/links/link-1/health'),
      { params: Promise.resolve({ listId: 'list-1', linkId: 'link-1' }) },
    ));

    expect(res.status).toBe(403);
    expect(checkLinkHealth).not.toHaveBeenCalled();
  });

  it('persists a manual recheck and metadata refresh result', async () => {
    const res = await json(await POSTLinkHealthAction(
      req('https://urlist.test/api/lists/list-1/links/link-1/health', { action: 'recheck' }),
      { params: Promise.resolve({ listId: 'list-1', linkId: 'link-1' }) },
    ));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ linkId: 'link-1', healthStatus: 'healthy', ogTitle: 'Fresh' });
    expect(checkLinkHealth).toHaveBeenCalledWith(link, {
      refreshMetadata: true,
      confirmMetadataOverwrite: false,
    });
    expect(updateLinkHealth).toHaveBeenCalledWith({
      listId: 'list-1',
      linkId: 'link-1',
      updates: { ...healthUpdate, healthDismissedAt: null },
    });
  });

  it('dismisses false positives without fetching the destination', async () => {
    const res = await json(await POSTLinkHealthAction(
      req('https://urlist.test/api/lists/list-1/links/link-1/health', { action: 'dismiss' }),
      { params: Promise.resolve({ listId: 'list-1', linkId: 'link-1' }) },
    ));

    expect(res.status).toBe(200);
    expect(res.body.data.healthStatus).toBe('dismissed');
    expect(checkLinkHealth).not.toHaveBeenCalled();
    expect(updateLinkHealth).toHaveBeenCalledWith(expect.objectContaining({
      listId: 'list-1',
      linkId: 'link-1',
      updates: expect.objectContaining({ healthStatus: 'dismissed', healthReason: 'dismissed' }),
    }));
  });

  it('rate limits manual checks', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 60 });

    const res = await json(await POSTLinkHealthAction(
      req('https://urlist.test/api/lists/list-1/links/link-1/health'),
      { params: Promise.resolve({ listId: 'list-1', linkId: 'link-1' }) },
    ));

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('rate limits manual checks per destination', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 60 });

    const res = await json(await POSTLinkHealthAction(
      req('https://urlist.test/api/lists/list-1/links/link-1/health'),
      { params: Promise.resolve({ listId: 'list-1', linkId: 'link-1' }) },
    ));

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('DESTINATION_RATE_LIMITED');
    expect(checkLinkHealth).not.toHaveBeenCalled();
    expect(updateLinkHealth).not.toHaveBeenCalled();
  });
});

describe('POST /api/link-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(authenticated);
    vi.mocked(getClientIp).mockReturnValue('1.2.3.4');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(getUserListIds).mockResolvedValue(['list-1']);
    vi.mocked(getListsWithLinks).mockResolvedValue([
      {
        listId: 'list-1',
        slug: 's',
        description: '',
        ownerId: 'u1',
        createdAt: 1,
        updatedAt: 2,
        links: [
          { ...link, id: 'link-1', healthStatus: 'unchecked' },
          { ...link, id: 'link-2', healthStatus: 'unchecked' },
        ],
      },
    ] satisfies ListWithLinks[]);
    vi.mocked(checkLinkHealth).mockResolvedValue(healthUpdate);
    vi.mocked(updateLinkHealth).mockResolvedValue();
  });

  it('requires an authenticated owner', async () => {
    vi.mocked(verifyAuth).mockResolvedValue(unauthenticated);

    const res = await json(await POSTLinkHealthJob(req('https://urlist.test/api/link-health')));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('runs a bounded deduplicated job across due user links', async () => {
    const res = await json(await POSTLinkHealthJob(req('https://urlist.test/api/link-health', { limit: 2 })));

    expect(res.status).toBe(200);
    expect(res.body.data.checked).toBe(2);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.deduplicatedDestinations).toBe(1);
    expect(checkLinkHealth).toHaveBeenCalledTimes(1);
    expect(updateLinkHealth).toHaveBeenCalledTimes(2);
    expect(updateLinkHealth).toHaveBeenNthCalledWith(2, {
      listId: 'list-1',
      linkId: 'link-2',
      updates: {
        healthStatus: healthUpdate.healthStatus,
        healthReason: healthUpdate.healthReason,
        healthCheckedAt: healthUpdate.healthCheckedAt,
        healthFinalUrl: healthUpdate.healthFinalUrl,
        healthHttpStatus: healthUpdate.healthHttpStatus,
        healthFailureCount: healthUpdate.healthFailureCount,
        healthNextCheckAt: healthUpdate.healthNextCheckAt,
        healthDismissedAt: null,
      },
    });
  });

  it('skips a bounded job destination when its destination cooldown is exhausted', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 60 });

    const res = await json(await POSTLinkHealthJob(req('https://urlist.test/api/link-health', { limit: 2 })));

    expect(res.status).toBe(200);
    expect(res.body.data.checked).toBe(0);
    expect(res.body.data.skipped).toBe(2);
    expect(checkLinkHealth).not.toHaveBeenCalled();
    expect(updateLinkHealth).not.toHaveBeenCalled();
  });

  it('requires ownership when a listId is provided', async () => {
    vi.mocked(getList).mockResolvedValue({ slug: 's', description: '', ownerId: 'other', createdAt: 1, updatedAt: 2 });

    const res = await json(await POSTLinkHealthJob(req('https://urlist.test/api/link-health', { listId: 'list-1' })));

    expect(res.status).toBe(403);
    expect(checkLinkHealth).not.toHaveBeenCalled();
  });
});
