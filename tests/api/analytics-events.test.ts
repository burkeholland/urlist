import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rtdb', () => ({
  getList: vi.fn(),
}));
vi.mock('@/lib/analytics', () => ({
  recordPageView: vi.fn().mockResolvedValue(undefined),
  recordLinkClick: vi.fn().mockResolvedValue(undefined),
  hashVisitorId: vi.fn().mockResolvedValue('abc123hash'),
}));
vi.mock('@/lib/rate-limiter', () => ({
  getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMITS: { slugCheck: { endpoint: 'slug-check', limit: 120, windowSeconds: 3600 } },
}));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

import { POST } from '@/app/api/lists/[listId]/analytics/events/route';
import { getList } from '@/lib/rtdb';
import { recordPageView, recordLinkClick } from '@/lib/analytics';
import { checkRateLimit } from '@/lib/rate-limiter';

const mockGetList = getList as ReturnType<typeof vi.fn>;
const mockRecordPageView = recordPageView as ReturnType<typeof vi.fn>;
const mockRecordLinkClick = recordLinkClick as ReturnType<typeof vi.fn>;
const mockCheckRateLimit = checkRateLimit as ReturnType<typeof vi.fn>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/lists/list123/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'TestAgent/1.0' },
    body: JSON.stringify(body),
  });
}

const mockList = { slug: 'my-list', description: '', ownerId: 'user1', createdAt: 1000, updatedAt: 1000 };
const params = { params: Promise.resolve({ listId: 'list123' }) };

describe('POST /api/lists/[listId]/analytics/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetList.mockResolvedValue(mockList);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it('returns 404 when list does not exist', async () => {
    mockGetList.mockResolvedValue(null);
    const req = createRequest({ type: 'pageView' });
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const req = createRequest({ type: 'pageView' });
    const res = await POST(req, params);
    expect(res.status).toBe(429);
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid event type', async () => {
    const req = createRequest({ type: 'invalidType' });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('pageView');
  });

  it('returns 400 for linkClick without linkId', async () => {
    const req = createRequest({ type: 'linkClick' });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('linkId');
  });

  it('returns 204 and records pageView', async () => {
    const req = createRequest({ type: 'pageView', referrer: 'https://google.com' });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
    expect(mockRecordPageView).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'my-list',
      visitorId: 'abc123hash',
      referrer: 'https://google.com',
    }));
  });

  it('returns 204 and records linkClick', async () => {
    const req = createRequest({ type: 'linkClick', linkId: 'link1', referrer: null });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
    expect(mockRecordLinkClick).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'my-list',
      linkId: 'link1',
      visitorId: 'abc123hash',
    }));
  });

  it('returns 204 even when analytics write fails (graceful degradation)', async () => {
    mockRecordPageView.mockRejectedValueOnce(new Error('Cosmos timeout'));
    const req = createRequest({ type: 'pageView' });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
  });
});
