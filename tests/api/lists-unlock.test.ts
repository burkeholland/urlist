import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { _resetSecretCache, verifyListAccessToken } from '@/lib/auth';

vi.mock('@/lib/rtdb', () => ({
  resolveSlug: vi.fn(),
  getListAccessRecord: vi.fn(),
}));
vi.mock('@/lib/rate-limiter', () => ({
  getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
  checkRateLimit: vi.fn(),
  reserveRateLimit: vi.fn(),
  RATE_LIMITS: {
    passwordUnlockClient: { endpoint: 'password-unlock-client', limit: 100, windowSeconds: 900 },
    passwordUnlock: { endpoint: 'password-unlock', limit: 5, windowSeconds: 900 },
    passwordUnlockList: { endpoint: 'password-unlock-list', limit: 25, windowSeconds: 900 },
  },
}));
vi.mock('@/lib/password', () => ({ verifyListPassword: vi.fn() }));

import { POST } from '@/app/api/lists/unlock/route';
import { getListAccessRecord, resolveSlug } from '@/lib/rtdb';
import { checkRateLimit, reserveRateLimit } from '@/lib/rate-limiter';
import { verifyListPassword } from '@/lib/password';

const req = (body: unknown) => new NextRequest('https://urlist.test/api/lists/unlock', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

const protectedRecord = {
  list: {
    slug: 'secret-list',
    description: 'hidden',
    ownerId: 'u1',
    visibility: 'password-protected' as const,
    hasPassword: true,
    createdAt: 1,
    updatedAt: 2,
  },
  passwordHash: 'scrypt$hash',
  passwordUpdatedAt: 10,
};

function reservation(allowed: boolean, retryAfter?: number) {
  return { allowed, retryAfter, release: vi.fn() };
}

describe('POST /api/lists/unlock', () => {
  let clientListSlot: ReturnType<typeof reservation>;
  let listSlot: ReturnType<typeof reservation>;

  beforeAll(() => {
    process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
    _resetSecretCache();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
    vi.mocked(getListAccessRecord).mockResolvedValue(protectedRecord);
    vi.mocked(verifyListPassword).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    clientListSlot = reservation(true);
    listSlot = reservation(true);
    vi.mocked(reserveRateLimit).mockImplementation((key) => (key === 'list-1' ? listSlot : clientListSlot));
  });

  it('sets a short-lived secure httpOnly unlock cookie scoped to the list after a valid password', async () => {
    const res = await POST(req({ slug: 'secret-list', password: 'super-secret' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(verifyListPassword).toHaveBeenCalledWith('super-secret', 'scrypt$hash');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('list_access_list-1=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=lax');
    expect(cookie).toContain('Max-Age=7200');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('super-secret');

    const token = cookie.match(/list_access_list-1=([^;]+)/)![1];
    await expect(verifyListAccessToken(token, 'list-1', 10)).resolves.toBe(true);
    await expect(verifyListAccessToken(token, 'list-1', 11)).resolves.toBe(false);
  });

  it('hands both failure-budget slots back after a successful unlock', async () => {
    await POST(req({ slug: 'secret-list', password: 'super-secret' }));
    expect(reserveRateLimit).toHaveBeenCalledWith('1.2.3.4:list-1', expect.objectContaining({ endpoint: 'password-unlock' }));
    expect(reserveRateLimit).toHaveBeenCalledWith('list-1', expect.objectContaining({ endpoint: 'password-unlock-list' }));
    expect(clientListSlot.release).toHaveBeenCalledTimes(1);
    expect(listSlot.release).toHaveBeenCalledTimes(1);
  });

  it('keeps both slots counted after a wrong password', async () => {
    vi.mocked(verifyListPassword).mockResolvedValueOnce(false);
    const res = await json(await POST(req({ slug: 'secret-list', password: 'wrong-password' })));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
    expect(clientListSlot.release).not.toHaveBeenCalled();
    expect(listSlot.release).not.toHaveBeenCalled();
  });

  it('caps all unlock requests per client before touching the database', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, retryAfter: 900 });
    const response = await POST(req({ slug: 'secret-list', password: 'super-secret' }));
    const res = await json(response);
    expect(res.status).toBe(429);
    expect(res.body.error).toEqual({ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many unlock attempts. Try again later.', retryAfter: 900 });
    expect(response.headers.get('Retry-After')).toBe('900');
    expect(checkRateLimit).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({ endpoint: 'password-unlock-client' }));
    expect(resolveSlug).not.toHaveBeenCalled();
    expect(verifyListPassword).not.toHaveBeenCalled();
  });

  it('rate limits failed attempts per client and list before checking the password', async () => {
    clientListSlot = reservation(false, 60);
    const response = await POST(req({ slug: 'secret-list', password: 'super-secret' }));
    const res = await json(response);
    expect(res.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(verifyListPassword).not.toHaveBeenCalled();
    expect(reserveRateLimit).toHaveBeenCalledTimes(1);
  });

  it('rate limits per list so rotating client IPs cannot keep guessing, and returns the client slot', async () => {
    listSlot = reservation(false, 120);
    const response = await POST(req({ slug: 'secret-list', password: 'super-secret' }));
    const res = await json(response);
    expect(res.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('120');
    expect(clientListSlot.release).toHaveBeenCalledTimes(1);
    expect(verifyListPassword).not.toHaveBeenCalled();
  });

  it('keys failure budgets by resolved listId so slug aliases share one budget', async () => {
    await POST(req({ slug: 'team/handout', password: 'super-secret' }));
    expect(resolveSlug).toHaveBeenCalledWith('team/handout');
    expect(reserveRateLimit).toHaveBeenCalledWith('1.2.3.4:list-1', expect.anything());
    expect(reserveRateLimit).toHaveBeenCalledWith('list-1', expect.anything());
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['a JSON string', '"secret-list"'],
    ['a missing password', { slug: 'secret-list' }],
    ['a missing slug', { password: 'super-secret' }],
    ['a non-string password', { slug: 'secret-list', password: 12345678 }],
    ['an empty password', { slug: 'secret-list', password: '' }],
    ['an oversized password', { slug: 'secret-list', password: 'x'.repeat(1025) }],
    ['an uppercase slug', { slug: 'Secret-List', password: 'super-secret' }],
    ['a slug with invalid characters', { slug: 'secret?list', password: 'super-secret' }],
    ['a reserved slug', { slug: 'api/lists', password: 'super-secret' }],
  ])('rejects %s with the generic error before any lookup or scrypt work', async (_label, body) => {
    const res = await json(await POST(req(body)));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(resolveSlug).not.toHaveBeenCalled();
    expect(verifyListPassword).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown slug', () => vi.mocked(resolveSlug).mockResolvedValueOnce(null)],
    ['a slug whose list was deleted', () => vi.mocked(getListAccessRecord).mockResolvedValueOnce(null)],
    ['a public list', () => vi.mocked(getListAccessRecord).mockResolvedValueOnce({
      ...protectedRecord,
      list: { ...protectedRecord.list, visibility: 'public', hasPassword: false },
    })],
    ['a protected list with no stored hash', () => vi.mocked(getListAccessRecord).mockResolvedValueOnce({
      ...protectedRecord,
      passwordHash: null,
    })],
  ])('returns the same generic error for %s without consuming failure budget', async (_label, arrange) => {
    arrange();
    const res = await json(await POST(req({ slug: 'secret-list', password: 'super-secret' })));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'INVALID_PASSWORD', message: 'Unable to unlock this list.' } });
    expect(reserveRateLimit).not.toHaveBeenCalled();
    expect(verifyListPassword).not.toHaveBeenCalled();
  });
});
