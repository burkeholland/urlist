import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { _resetSecretCache } from '@/lib/auth';

vi.mock('@/lib/rtdb', () => ({
  resolveSlug: vi.fn(),
  getList: vi.fn(),
  getListPasswordAccess: vi.fn(),
}));
vi.mock('@/lib/rate-limiter', () => ({
  getClientIp: vi.fn().mockReturnValue('1.2.3.4'),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMITS: {
    passwordUnlock: { endpoint: 'password-unlock', limit: 5, windowSeconds: 900 },
    passwordUnlockList: { endpoint: 'password-unlock-list', limit: 25, windowSeconds: 900 },
  },
}));
vi.mock('@/lib/password', () => ({ verifyListPassword: vi.fn() }));

import { POST } from '@/app/api/lists/unlock/route';
import { getList, getListPasswordAccess, resolveSlug } from '@/lib/rtdb';
import { checkRateLimit } from '@/lib/rate-limiter';
import { verifyListPassword } from '@/lib/password';

const req = (body: unknown) => new NextRequest('https://urlist.test/api/lists/unlock', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const json = async (res: Response) => ({ status: res.status, body: await res.json() });

describe('POST /api/lists/unlock', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
    _resetSecretCache();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
    vi.mocked(getList).mockResolvedValue({
      slug: 'secret-list',
      description: 'hidden',
      ownerId: 'u1',
      visibility: 'password-protected',
      hasPassword: true,
      createdAt: 1,
      updatedAt: 2,
    });
    vi.mocked(getListPasswordAccess).mockResolvedValue({
      visibility: 'password-protected',
      passwordHash: 'scrypt$hash',
      passwordUpdatedAt: 10,
    });
    vi.mocked(verifyListPassword).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  });

  it('sets a short-lived secure httpOnly unlock cookie after a valid password', async () => {
    const res = await POST(req({ slug: 'secret-list', password: 'super-secret' }));
    expect(res.status).toBe(204);
    expect(verifyListPassword).toHaveBeenCalledWith('super-secret', 'scrypt$hash');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('list_access_list-1=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=lax');
    expect(cookie).toContain('Max-Age=7200');
  });

  it('rate limits unlock attempts by IP and slug before checking the password', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfter: 60 });
    const res = await json(await POST(req({ slug: 'secret-list', password: 'super-secret' })));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(checkRateLimit).toHaveBeenCalledWith('1.2.3.4:secret-list', expect.objectContaining({ endpoint: 'password-unlock' }));
    expect(verifyListPassword).not.toHaveBeenCalled();
  });

  it('also rate limits by slug so spoofed client IPs cannot bypass password attempts', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 120 });

    const response = await POST(req({ slug: 'secret-list', password: 'super-secret' }));
    const res = await json(response);

    expect(res.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('120');
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      1,
      '1.2.3.4:secret-list',
      expect.objectContaining({ endpoint: 'password-unlock' }),
    );
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      2,
      'secret-list',
      expect.objectContaining({ endpoint: 'password-unlock-list' }),
    );
    expect(verifyListPassword).not.toHaveBeenCalled();
  });

  it('returns the same generic error for missing, unknown, and wrong passwords', async () => {
    const missing = await json(await POST(req({ slug: 'secret-list' })));
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('INVALID_PASSWORD');

    vi.mocked(resolveSlug).mockResolvedValueOnce(null);
    const unknown = await json(await POST(req({ slug: 'missing-list', password: 'super-secret' })));
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_PASSWORD');

    vi.mocked(verifyListPassword).mockResolvedValueOnce(false);
    const wrong = await json(await POST(req({ slug: 'secret-list', password: 'wrong-password' })));
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');
  });

  it('rejects oversized passwords before scrypt verification', async () => {
    const res = await json(await POST(req({ slug: 'secret-list', password: 'x'.repeat(1025) })));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
    expect(verifyListPassword).not.toHaveBeenCalled();
  });
});
