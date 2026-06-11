import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createSessionToken: vi.fn().mockResolvedValue('mock-session-token'),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from '@/app/api/auth/callback/route';

function createCallbackRequest(opts: {
  code?: string;
  state?: string;
  cookieState?: string;
} = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/auth/callback');
  if (opts.code) url.searchParams.set('code', opts.code);
  if (opts.state) url.searchParams.set('state', opts.state);

  const headers = new Headers();
  if (opts.cookieState) {
    headers.set('Cookie', `oauth_state=${opts.cookieState}`);
  }

  return new NextRequest(url, { headers });
}

describe('GET /api/auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
  });

  it('redirects with error when state mismatch', async () => {
    const req = createCallbackRequest({ code: 'abc', state: 'state1', cookieState: 'state2' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=invalid_state');
  });

  it('redirects with error when state is missing', async () => {
    const req = createCallbackRequest({ code: 'abc' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=invalid_state');
  });

  it('redirects with error when code is missing', async () => {
    const req = createCallbackRequest({ state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=no_code');
  });

  it('redirects with error when GitHub token exchange fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
    const req = createCallbackRequest({ code: 'bad-code', state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=auth_failed');
  });

  it('redirects with error when GitHub token response has no access_token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'bad_verification_code' }),
    });
    const req = createCallbackRequest({ code: 'expired', state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=auth_failed');
  });

  it('redirects with error when GitHub user fetch fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'ghp_abc123' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 401 });
    const req = createCallbackRequest({ code: 'valid', state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=profile_failed');
  });

  it('redirects with error when GitHub user response is malformed', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'ghp_abc123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'data' }),
      });
    const req = createCallbackRequest({ code: 'valid', state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=profile_failed');
  });

  it('sets session cookie and redirects to /app/compose on success', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'ghp_abc123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12345, login: 'octocat', name: 'Mona Lisa' }),
      });
    const req = createCallbackRequest({ code: 'valid', state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('/app/compose');
    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find(c => c.startsWith('session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Path=/');
  });

  it('clears oauth_state cookie on success', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'ghp_abc123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12345, login: 'octocat', name: null }),
      });
    const req = createCallbackRequest({ code: 'valid', state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    const setCookies = res.headers.getSetCookie();
    const oauthCookie = setCookies.find(c => c.startsWith('oauth_state='));
    expect(oauthCookie).toContain('Max-Age=0');
  });

  it('handles fetch network error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const req = createCallbackRequest({ code: 'valid', state: 'valid', cookieState: 'valid' });
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toContain('error=auth_failed');
  });
});
