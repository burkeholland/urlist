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
    const body = await res.json();
    expect(body.error.code).toBe('LIST_NOT_FOUND');
    expect(body.error.message).toBe('No list exists with this ID.');
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const req = createRequest({ type: 'pageView' });
    const res = await POST(req, params);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.message).toBe('Too many requests.');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('Invalid JSON body.');
  });

  it('returns 400 for invalid event type', async () => {
    const req = createRequest({ type: 'invalidType' });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('type must be "pageView" or "linkClick".');
  });

  it('returns 400 for linkClick without linkId', async () => {
    const req = createRequest({ type: 'linkClick' });
    const res = await POST(req, params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toBe('linkId is required for linkClick events.');
  });

  it('returns 204 and records pageView', async () => {
    const req = createRequest({ type: 'pageView', referrer: 'https://google.com', utmSource: 's', utmMedium: 'm', utmCampaign: 'c' });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
    expect(mockRecordPageView).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'my-list',
      visitorId: 'abc123hash',
      referrer: 'https://google.com',
      utmSource: 's',
      utmMedium: 'm',
      utmCampaign: 'c',
    }));
  });

  it('defaults missing utm fields and referrer to null', async () => {
    const req = createRequest({ type: 'pageView' });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
    expect(mockRecordPageView).toHaveBeenCalledWith(expect.objectContaining({
      referrer: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    }));
  });

  it('passes the Cloudflare country header through when present', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'TestAgent/1.0', 'cf-ipcountry': 'DE' },
      body: JSON.stringify({ type: 'pageView' }),
    });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
    expect(mockRecordPageView).toHaveBeenCalledWith(expect.objectContaining({ country: 'DE' }));
  });

  it('defaults country to null when the header is absent', async () => {
    const req = createRequest({ type: 'pageView' });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
    expect(mockRecordPageView).toHaveBeenCalledWith(expect.objectContaining({ country: null }));
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

  it('handles missing user-agent header', async () => {
    const req = new NextRequest('http://localhost:3000/api/lists/list123/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pageView' }),
    });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
    expect(mockRecordPageView).toHaveBeenCalled();
  });

  it('passes the user-agent to the visitor hash', async () => {
    const { hashVisitorId } = await import('@/lib/analytics');
    const req = createRequest({ type: 'pageView' });
    await POST(req, params);
    expect(hashVisitorId).toHaveBeenCalledWith('1.2.3.4', 'TestAgent/1.0');
  });

  it('returns 204 even when analytics write fails (graceful degradation)', async () => {
    mockRecordPageView.mockRejectedValueOnce(new Error('Cosmos timeout'));
    const req = createRequest({ type: 'pageView' });
    const res = await POST(req, params);
    expect(res.status).toBe(204);
  });

  it('logs analytics write failures', async () => {
    const { log } = await import('@/lib/logger');
    mockRecordPageView.mockRejectedValueOnce(new Error('Cosmos timeout'));
    const req = createRequest({ type: 'pageView' });
    await POST(req, params);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      message: 'Failed to record analytics event',
      service: 'analytics-events',
      data: { listId: 'list123', type: 'pageView', error: 'Error: Cosmos timeout' },
    }));
  });
});
