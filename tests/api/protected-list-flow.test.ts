import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Only storage is faked: tokens, rate limits, and access checks are the real modules.
vi.mock('@/lib/rtdb', () => ({ resolveSlug: vi.fn(), getListAccessRecord: vi.fn(), getLinks: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  recordPageView: vi.fn(),
  recordLinkClick: vi.fn(),
  hashVisitorId: vi.fn().mockResolvedValue('visitor-hash'),
}));
vi.mock('@/lib/password', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/password')>();
  return { ...actual, verifyListPassword: vi.fn(actual.verifyListPassword) };
});

import { POST as unlock } from '@/app/api/lists/unlock/route';
import { GET as getList } from '@/app/api/lists/[listId]/route';
import { POST as trackEvent } from '@/app/api/lists/[listId]/analytics/events/route';
import { _resetSecretCache } from '@/lib/auth';
import { recordPageView } from '@/lib/analytics';
import { hashListPassword, verifyListPassword } from '@/lib/password';
import { getLinks, getListAccessRecord, resolveSlug } from '@/lib/rtdb';
import type { ListVisibility } from '@/lib/types';

type StoredList = { visibility: ListVisibility; passwordHash: string | null; passwordUpdatedAt: number };
const lists = new Map<string, StoredList>();
const slugs = new Map<string, string>();

function storeList(listId: string, slug: string, list: StoredList) {
  lists.set(listId, list);
  slugs.set(slug, listId);
}

function unlockRequest(slug: string, password: string, ip: string) {
  return new NextRequest('https://urlist.test/api/lists/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `203.0.113.250, ${ip}` },
    body: JSON.stringify({ slug, password }),
  });
}

function listRequest(listId: string, cookie?: string) {
  return new NextRequest(`https://urlist.test/api/lists/${listId}`, { headers: cookie ? { cookie } : {} });
}

function eventRequest(listId: string, cookie?: string) {
  return new NextRequest(`https://urlist.test/api/lists/${listId}/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.1', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ type: 'pageView' }),
  });
}

const ctx = (listId: string) => ({ params: Promise.resolve({ listId }) });
const unlockCookie = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

describe('protected list flow', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
    _resetSecretCache();
  });

  beforeEach(() => {
    vi.mocked(resolveSlug).mockImplementation(async (slug) => slugs.get(slug) ?? null);
    vi.mocked(getListAccessRecord).mockImplementation(async (listId) => {
      const stored = lists.get(listId);
      if (!stored) return null;
      return {
        list: {
          slug: 'flow',
          description: 'Hidden handout',
          ownerId: 'owner-1',
          visibility: stored.visibility,
          hasPassword: !!stored.passwordHash,
          createdAt: 1,
          updatedAt: 2,
        },
        passwordHash: stored.passwordHash,
        passwordUpdatedAt: stored.passwordUpdatedAt,
      };
    });
    vi.mocked(getLinks).mockResolvedValue([
      { id: 'a', url: 'https://example.com/', position: 0, pinned: false, ogTitle: 'Hidden link', ogDescription: null, ogImage: null, ogSiteName: null, createdAt: 1 },
    ]);
  });

  it('locks data and analytics until unlocked, then relocks when the owner changes the password', async () => {
    const stored = { visibility: 'password-protected' as const, passwordHash: await hashListPassword('class-of-2026'), passwordUpdatedAt: 1000 };
    storeList('flow-list', 'flow', stored);

    const locked = await getList(listRequest('flow-list'), ctx('flow-list'));
    const lockedText = await locked.text();
    expect(locked.status).toBe(403);
    expect(lockedText).not.toContain('Hidden');
    expect((await trackEvent(eventRequest('flow-list'), ctx('flow-list'))).status).toBe(204);
    expect(recordPageView).not.toHaveBeenCalled();

    expect((await unlock(unlockRequest('flow', 'not-the-password', '192.0.2.10'))).status).toBe(401);
    const unlocked = await unlock(unlockRequest('flow', 'class-of-2026', '192.0.2.10'));
    expect(unlocked.status).toBe(204);
    const cookie = unlockCookie(unlocked);
    expect(cookie).toMatch(/^list_access_flow-list=/);

    const open = await getList(listRequest('flow-list', cookie), ctx('flow-list'));
    const openText = await open.text();
    expect(open.status).toBe(200);
    expect(JSON.parse(openText).links).toHaveLength(1);
    expect(openText).not.toContain(stored.passwordHash);
    expect(openText).not.toContain('passwordUpdatedAt');

    expect((await trackEvent(eventRequest('flow-list', cookie), ctx('flow-list'))).status).toBe(204);
    expect(recordPageView).toHaveBeenCalledTimes(1);

    stored.passwordHash = await hashListPassword('new-term-password');
    stored.passwordUpdatedAt = 2000;
    expect((await getList(listRequest('flow-list', cookie), ctx('flow-list'))).status).toBe(403);
  });

  describe('unlock rate limits', () => {
    beforeEach(() => {
      vi.mocked(verifyListPassword).mockImplementation(async (password) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return password === 'right-password';
      });
    });

    it('lets a whole classroom behind one school IP unlock with the right password', async () => {
      storeList('class-list', 'class', { visibility: 'password-protected', passwordHash: 'hash', passwordUpdatedAt: 1 });
      const statuses = [];
      for (let student = 0; student < 40; student++) {
        statuses.push((await unlock(unlockRequest('class', 'right-password', '192.0.2.20'))).status);
      }
      expect(statuses.every((status) => status === 204)).toBe(true);
    });

    it('stops one client after 5 wrong guesses, even if the next guess is right, without blocking others', async () => {
      storeList('brute-list', 'brute', { visibility: 'password-protected', passwordHash: 'hash', passwordUpdatedAt: 1 });
      vi.mocked(verifyListPassword).mockClear();
      for (let guess = 0; guess < 5; guess++) {
        expect((await unlock(unlockRequest('brute', `guess-${guess}`, '192.0.2.30'))).status).toBe(401);
      }
      expect((await unlock(unlockRequest('brute', 'right-password', '192.0.2.30'))).status).toBe(429);
      expect(verifyListPassword).toHaveBeenCalledTimes(5);
      expect((await unlock(unlockRequest('brute', 'right-password', '192.0.2.31'))).status).toBe(204);
    });

    it('counts parallel guesses while they are still being checked', async () => {
      storeList('burst-list', 'burst', { visibility: 'password-protected', passwordHash: 'hash', passwordUpdatedAt: 1 });
      vi.mocked(verifyListPassword).mockClear();
      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, guess) => unlock(unlockRequest('burst', `guess-${guess}`, '192.0.2.40'))),
      );
      const statuses = responses.map((res) => res.status);
      expect(statuses.filter((status) => status === 401)).toHaveLength(5);
      expect(statuses.filter((status) => status === 429)).toHaveLength(15);
      expect(verifyListPassword).toHaveBeenCalledTimes(5);
    });

    it('caps wrong guesses per list across rotating client IPs', async () => {
      storeList('spread-list', 'spread', { visibility: 'password-protected', passwordHash: 'hash', passwordUpdatedAt: 1 });
      for (let ip = 0; ip < 25; ip++) {
        expect((await unlock(unlockRequest('spread', 'wrong', `10.0.0.${ip}`))).status).toBe(401);
      }
      expect((await unlock(unlockRequest('spread', 'right-password', '10.0.1.1'))).status).toBe(429);
    });

    it('caps total unlock requests per client across lists', async () => {
      for (let request = 0; request < 100; request++) {
        expect((await unlock(unlockRequest(`missing-${request}`, 'whatever', '192.0.2.50'))).status).toBe(401);
      }
      expect((await unlock(unlockRequest('missing-final', 'whatever', '192.0.2.50'))).status).toBe(429);
    });
  });
});
