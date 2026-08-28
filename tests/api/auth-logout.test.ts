import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/auth/logout/route';

describe('POST /api/auth/logout', () => {
  it('returns ok: true', async () => {
    const res = await POST();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('clears session cookie with maxAge 0', async () => {
    const res = await POST();
    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find(c => c.startsWith('session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/^session=;/);
    expect(sessionCookie).toContain('Max-Age=0');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).toContain('SameSite=lax');
  });
});
