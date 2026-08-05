import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, getClientIp, RATE_LIMITS, _sweepStaleEntries } from '@/lib/rate-limiter';
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

  it('trims whitespace around the forwarded IP', () => {
    const req = createMockRequest({ 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' });
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
    // Pin to a fixed instant that sits well inside any window bucket used below
    // (1h and 10h windows both divide this timestamp without a nearby boundary),
    // so advanceTimersByTime can never roll the window mid-test.
    vi.useFakeTimers({ now: new Date('2024-01-01T05:00:00Z') });
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

  it('counts every request against the limit in the same window', async () => {
    const config = { endpoint: 'test-exact', limit: 2, windowSeconds: 60 };
    expect((await checkRateLimit('exact-user', config)).allowed).toBe(true);
    expect((await checkRateLimit('exact-user', config)).allowed).toBe(true);
    const third = await checkRateLimit('exact-user', config);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBe(60);
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

  it('cleans up stale entries when the periodic sweep runs', async () => {
    const config = { endpoint: 'test-cleanup', limit: 5, windowSeconds: 60 };
    await checkRateLimit('cleanup-user', config);
    // Advance past the 2-hour retention window and run the sweep
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000);
    _sweepStaleEntries();
    // Stale entry was removed, so the fresh request starts a new window entry
    const result = await checkRateLimit('cleanup-user', config);
    expect(result.allowed).toBe(true);
  });

  it('keeps entries exactly at the 2-hour boundary during a sweep', async () => {
    const config = { endpoint: 'test-boundary', limit: 1, windowSeconds: 60 * 60 * 10 };
    await checkRateLimit('boundary-user', config);
    // At exactly 2h old (7200s) the entry is kept by the sweep...
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    _sweepStaleEntries();
    // ...and since the 10h window bucket has not rolled, the limit still applies
    const blocked = await checkRateLimit('boundary-user', config);
    expect(blocked.allowed).toBe(false);
    // 1 second later the entry crosses the retention boundary and is swept
    vi.advanceTimersByTime(1000);
    _sweepStaleEntries();
    const result = await checkRateLimit('boundary-user', config);
    expect(result.allowed).toBe(true);
  });

  it('does not count against the limit when the window rolled over', async () => {
    const config = { endpoint: 'test-rollover', limit: 1, windowSeconds: 60 };
    await checkRateLimit('rollover-user', config);
    vi.advanceTimersByTime(61 * 1000);
    const result = await checkRateLimit('rollover-user', config);
    expect(result.allowed).toBe(true);
  });

  it('keeps recent entries during the periodic sweep', async () => {
    const config = { endpoint: 'test-cleanup-keep', limit: 2, windowSeconds: 3600 * 5 };
    await checkRateLimit('keep-user', config);
    await checkRateLimit('keep-user', config);
    _sweepStaleEntries();
    const result = await checkRateLimit('keep-user', config);
    expect(result.allowed).toBe(false);
  });
});

describe('RATE_LIMITS', () => {
  it('has expected endpoints defined', () => {
    expect(RATE_LIMITS.publishAnonymous).toEqual({ endpoint: 'publish-anon', limit: 10, windowSeconds: 3600 });
    expect(RATE_LIMITS.publishAuthenticated).toEqual({ endpoint: 'publish-auth', limit: 100, windowSeconds: 3600 });
    expect(RATE_LIMITS.ogScrape).toEqual({ endpoint: 'og-scrape', limit: 60, windowSeconds: 3600 });
    expect(RATE_LIMITS.slugCheck).toEqual({ endpoint: 'slug-check', limit: 120, windowSeconds: 3600 });
  });

  it('authenticated limit is higher than anonymous', () => {
    expect(RATE_LIMITS.publishAuthenticated.limit).toBeGreaterThan(
      RATE_LIMITS.publishAnonymous.limit,
    );
  });
});
