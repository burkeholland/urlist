import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';
import { NextRequest } from 'next/server';

// Access the internal store for cleanup
function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  const url = 'http://localhost:3000/api/test';
  return new NextRequest(url, { headers });
}

describe('getClientIp', () => {
  it('extracts first IP from x-forwarded-for', () => {
    const req = createMockRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('returns single IP from x-forwarded-for', () => {
    const req = createMockRequest({ 'x-forwarded-for': '10.0.0.1' });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('returns 0.0.0.0 when no header', () => {
    const req = createMockRequest();
    expect(getClientIp(req)).toBe('0.0.0.0');
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under limit', async () => {
    const config = { endpoint: 'test-allow', limit: 5, windowSeconds: 60 };
    const result = await checkRateLimit('user1', config);
    expect(result.allowed).toBe(true);
  });

  it('blocks requests at limit', async () => {
    const config = { endpoint: 'test-block', limit: 3, windowSeconds: 60 };
    await checkRateLimit('user2', config);
    await checkRateLimit('user2', config);
    await checkRateLimit('user2', config);
    const result = await checkRateLimit('user2', config);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(60);
  });

  it('different IPs have separate limits', async () => {
    const config = { endpoint: 'test-sep', limit: 1, windowSeconds: 60 };
    await checkRateLimit('userA', config);
    const result = await checkRateLimit('userB', config);
    expect(result.allowed).toBe(true);
  });

  it('different endpoints have separate limits', async () => {
    const config1 = { endpoint: 'ep1', limit: 1, windowSeconds: 60 };
    const config2 = { endpoint: 'ep2', limit: 1, windowSeconds: 60 };
    await checkRateLimit('user3', config1);
    const result = await checkRateLimit('user3', config2);
    expect(result.allowed).toBe(true);
  });


  it('resets counter when window changes', async () => {
    const config = { endpoint: 'test-window-reset', limit: 2, windowSeconds: 60 };
    await checkRateLimit('window-user', config);
    await checkRateLimit('window-user', config);
    const blocked = await checkRateLimit('window-user', config);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(61 * 1000);

    const afterReset = await checkRateLimit('window-user', config);
    expect(afterReset.allowed).toBe(true);
  });
});

describe('RATE_LIMITS', () => {
  it('has expected endpoints defined', () => {
    expect(RATE_LIMITS.publishAnonymous).toBeDefined();
    expect(RATE_LIMITS.publishAuthenticated).toBeDefined();
    expect(RATE_LIMITS.ogScrape).toBeDefined();
    expect(RATE_LIMITS.slugCheck).toBeDefined();
  });

  it('authenticated limit is higher than anonymous', () => {
    expect(RATE_LIMITS.publishAuthenticated.limit).toBeGreaterThan(
      RATE_LIMITS.publishAnonymous.limit,
    );
  });
});
