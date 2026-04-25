import { describe, it, expect, beforeAll } from 'vitest';
import { _resetSecretCache, createSessionToken, verifyAuth, getSessionUser, AuthError, requireAuth } from '@/lib/auth';
import { NextRequest } from 'next/server';

// Set AUTH_SECRET for tests (must happen before any auth function call)
beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
  _resetSecretCache();
});

const testUser = {
  uid: 'user123',
  username: 'testuser',
  name: 'Test User',
  avatar: 'https://github.com/testuser.png',
};

function createRequest(opts: { cookie?: string; bearer?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.bearer) {
    headers.set('Authorization', `Bearer ${opts.bearer}`);
  }
  if (opts.cookie) {
    headers.set('Cookie', `session=${opts.cookie}`);
  }
  return new NextRequest('http://localhost:3000/api/test', { headers });
}

describe('createSessionToken', () => {
  it('creates a valid JWT string', async () => {
    const token = await createSessionToken(testUser);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('verifyAuth', () => {
  it('returns authenticated with valid cookie', async () => {
    const token = await createSessionToken(testUser);
    const req = createRequest({ cookie: token });
    const result = await verifyAuth(req);
    expect(result.authenticated).toBe(true);
    expect(result.uid).toBe('user123');
  });

  it('returns authenticated with valid bearer token', async () => {
    const token = await createSessionToken(testUser);
    const req = createRequest({ bearer: token });
    const result = await verifyAuth(req);
    expect(result.authenticated).toBe(true);
    expect(result.uid).toBe('user123');
  });

  it('returns unauthenticated with no token', async () => {
    const req = createRequest();
    const result = await verifyAuth(req);
    expect(result.authenticated).toBe(false);
    expect(result.uid).toBeNull();
  });

  it('returns unauthenticated with invalid token', async () => {
    const req = createRequest({ cookie: 'invalid.jwt.token' });
    const result = await verifyAuth(req);
    expect(result.authenticated).toBe(false);
    expect(result.error).toMatch(/invalid|expired/i);
  });

  it('prefers cookie over bearer', async () => {
    const token = await createSessionToken(testUser);
    const req = createRequest({ cookie: token, bearer: 'bad-token' });
    const result = await verifyAuth(req);
    expect(result.authenticated).toBe(true);
  });
});

describe('getSessionUser', () => {
  it('returns user from valid cookie', async () => {
    const token = await createSessionToken(testUser);
    const req = createRequest({ cookie: token });
    const user = await getSessionUser(req);
    expect(user).not.toBeNull();
    expect(user!.uid).toBe('user123');
    expect(user!.username).toBe('testuser');
    expect(user!.name).toBe('Test User');
  });

  it('returns null with no cookie', async () => {
    const req = createRequest();
    const user = await getSessionUser(req);
    expect(user).toBeNull();
  });

  it('returns null with invalid cookie', async () => {
    const req = createRequest({ cookie: 'garbage' });
    const user = await getSessionUser(req);
    expect(user).toBeNull();
  });
});

describe('requireAuth', () => {
  it('does not throw for authenticated result', () => {
    expect(() => requireAuth({ authenticated: true, uid: 'user123' })).not.toThrow();
  });

  it('throws AuthError for unauthenticated result', () => {
    expect(() => requireAuth({ authenticated: false, uid: null })).toThrow(AuthError);
  });
});

describe('AuthError', () => {
  it('has code and message', () => {
    const err = new AuthError('TEST_CODE', 'test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.name).toBe('AuthError');
    expect(err instanceof Error).toBe(true);
  });
});
