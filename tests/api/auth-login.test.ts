import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/auth/login/route';

describe('GET /api/auth/login', () => {
  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
  });

  it('redirects to GitHub OAuth authorize endpoint', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login');
    const res = await GET(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('Location')!;
    expect(location).toContain('https://github.com/login/oauth/authorize');
    expect(location).toContain('client_id=test-client-id');
    expect(location).toContain('scope=read%3Auser');
  });

  it('sets oauth_state cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login');
    const res = await GET(req);
    const setCookies = res.headers.getSetCookie();
    const stateCookie = setCookies.find(c => c.startsWith('oauth_state='));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain('HttpOnly');
    expect(stateCookie).toContain('Max-Age=600');
    expect(stateCookie).toContain('SameSite=lax');
    expect(stateCookie).toContain('Path=/');
  });

  it('points the GitHub redirect at the callback URL derived from the request', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login');
    const res = await GET(req);
    const location = res.headers.get('Location')!;
    expect(location).toContain('redirect_uri=' + encodeURIComponent('http://localhost:3000/api/auth/callback'));
  });

  it('includes state param matching cookie value', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/login');
    const res = await GET(req);
    const location = res.headers.get('Location')!;
    const setCookies = res.headers.getSetCookie();
    const stateCookie = setCookies.find(c => c.startsWith('oauth_state='))!;
    const cookieState = stateCookie.split(';')[0].split('=')[1];
    expect(location).toContain(`state=${cookieState}`);
  });

  it('returns 500 when GITHUB_CLIENT_ID is not configured', async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const req = new NextRequest('http://localhost:3000/api/auth/login');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('OAUTH_NOT_CONFIGURED');
  });
});
