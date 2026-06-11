import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/logout/route';

describe('POST /api/auth/logout', () => {
  it('returns ok: true', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('clears session cookie with maxAge 0', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find(c => c.startsWith('session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('Max-Age=0');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Path=/');
  });
});
