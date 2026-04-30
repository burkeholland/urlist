import { describe, it, expect } from 'vitest';
import { hashVisitorId } from '@/lib/analytics';

describe('hashVisitorId', () => {
  it('returns a 32-character hex string', async () => {
    const hash = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces the same hash for same inputs', async () => {
    const a = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    const b = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    expect(a).toBe(b);
  });

  it('produces different hashes for different IPs', async () => {
    const a = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    const b = await hashVisitorId('5.6.7.8', 'Mozilla/5.0');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different user agents', async () => {
    const a = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    const b = await hashVisitorId('1.2.3.4', 'Chrome/100');
    expect(a).not.toBe(b);
  });
});

// Note: recordPageView, recordLinkClick, getListAnalytics, and getListAnalyticsSummary
// require a Cosmos DB connection and are tested via integration tests or manually.
// The pure functions (hashVisitorId) are covered here.
