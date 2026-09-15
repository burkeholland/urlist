import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  _resetSecretCache,
  createSessionToken,
  verifyAuth,
  getSessionUser,
  AuthError,
  requireAuth,
} from '@/lib/auth';
import { NextRequest } from 'next/server';

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

function createRequest(opts: { cookie?: string; bearer?: string; scheme?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.bearer) {
    headers.set('Authorization', `${opts.scheme ?? 'Bearer'} ${opts.bearer}`);
  }
  if (opts.cookie) {
    headers.set('Cookie', `session=${opts.cookie}`);
  }
  return new NextRequest('http://localhost:3000/api/test', { headers });
}

describe('getSecret', () => {
  it('throws when AUTH_SECRET is missing or too short', async () => {
    const original = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    _resetSecretCache();
    try {
      await expect(createSessionToken(testUser)).rejects.toThrow(/AUTH_SECRET/);
    } finally {
      process.env.AUTH_SECRET = original;
      _resetSecretCache();
    }
  });

  it('throws when AUTH_SECRET is under 32 characters', async () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'short-secret';
    _resetSecretCache();
    try {
      await expect(createSessionToken(testUser)).rejects.toThrow(/AUTH_SECRET/);
    } finally {
      process.env.AUTH_SECRET = original;
      _resetSecretCache();
    }
  });

  it('accepts an AUTH_SECRET of exactly 32 characters', async () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'x'.repeat(32);
    _resetSecretCache();
    try {
      await expect(createSessionToken(testUser)).resolves.toEqual(expect.any(String));
    } finally {
      process.env.AUTH_SECRET = original;
      _resetSecretCache();
    }
  });
});

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
    const result = await verifyAuth(createRequest({ cookie: token }));
    expect(result.authenticated).toBe(true);
    expect(result.uid).toBe('user123');
  });

  it('returns authenticated with valid bearer token', async () => {
    const token = await createSessionToken(testUser);
    const result = await verifyAuth(createRequest({ bearer: token }));
    expect(result.authenticated).toBe(true);
    expect(result.uid).toBe('user123');
  });

  it('accepts a case-insensitive bearer scheme', async () => {
    const token = await createSessionToken(testUser);
    const result = await verifyAuth(createRequest({ bearer: token, scheme: 'bearer' }));
    expect(result.authenticated).toBe(true);
  });

  it('rejects a malformed Authorization header', async () => {
    const headers = new Headers({ Authorization: 'Token abc123' });
    const result = await verifyAuth(new NextRequest('http://localhost:3000/api/test', { headers }));
    expect(result.authenticated).toBe(false);
  });

  it('rejects a bearer token with an empty token', async () => {
    const headers = new Headers({ Authorization: 'Bearer ' });
    const result = await verifyAuth(new NextRequest('http://localhost:3000/api/test', { headers }));
    expect(result.authenticated).toBe(false);
  });

  it('rejects a bearer header where whitespace separates junk', async () => {
    const headers = new Headers({ Authorization: 'Bearer    ' });
    const result = await verifyAuth(new NextRequest('http://localhost:3000/api/test', { headers }));
    expect(result.authenticated).toBe(false);
  });

  it('rejects a header that only starts with Bearer', async () => {
    const headers = new Headers({ Authorization: 'BearerToken abc' });
    const result = await verifyAuth(new NextRequest('http://localhost:3000/api/test', { headers }));
    expect(result.authenticated).toBe(false);
  });

  it('rejects a bearer token with trailing junk', async () => {
    const token = await createSessionToken(testUser);
    const headers = new Headers({ Authorization: `Bearer ${token} trailing` });
    const result = await verifyAuth(new NextRequest('http://localhost:3000/api/test', { headers }));
    expect(result.authenticated).toBe(false);
  });

  it('returns unauthenticated with no token', async () => {
    const result = await verifyAuth(createRequest());
    expect(result.authenticated).toBe(false);
    expect(result.uid).toBeNull();
  });

  it('returns unauthenticated with invalid token', async () => {
    const result = await verifyAuth(createRequest({ cookie: 'invalid.jwt.token' }));
    expect(result.authenticated).toBe(false);
    expect(result.error).toMatch(/invalid|expired/i);
  });

  it('prefers cookie over bearer', async () => {
    const token = await createSessionToken(testUser);
    const result = await verifyAuth(createRequest({ cookie: token, bearer: 'bad-token' }));
    expect(result.authenticated).toBe(true);
  });
});

describe('getSessionUser', () => {
  it('returns user from valid cookie', async () => {
    const token = await createSessionToken(testUser);
    const user = await getSessionUser(createRequest({ cookie: token }));
    expect(user).not.toBeNull();
    expect(user!.uid).toBe('user123');
    expect(user!.username).toBe('testuser');
    expect(user!.name).toBe('Test User');
  });

  it('returns null with no cookie', async () => {
    await expect(getSessionUser(createRequest())).resolves.toBeNull();
  });

  it('returns null with invalid cookie', async () => {
    await expect(getSessionUser(createRequest({ cookie: 'garbage' }))).resolves.toBeNull();
  });

  it('returns null for a token with malformed payload', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-secret-for-vitest-minimum-32-chars');
    const badToken = await new SignJWT({ uid: 'u', name: 'n' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);
    await expect(getSessionUser(createRequest({ cookie: badToken }))).resolves.toBeNull();
  });

  it('falls back to username when name is empty', async () => {
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode('test-secret-for-vitest-minimum-32-chars');
    const token = await new SignJWT({ uid: 'user123', username: 'testuser', name: '', avatar: '' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);
    const user = await getSessionUser(createRequest({ cookie: token }));
    expect(user!.name).toBe('testuser');
  });
});

describe('requireAuth', () => {
  it('does not throw for authenticated result', () => {
    expect(() => requireAuth({ authenticated: true, uid: 'user123' })).not.toThrow();
  });

  it('throws AuthError for unauthenticated result', () => {
    expect(() => requireAuth({ authenticated: false, uid: null })).toThrow(AuthError);
    try {
      requireAuth({ authenticated: false, uid: null });
      expect.unreachable();
    } catch (error) {
      const err = error as AuthError;
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.message).toBe('Missing or invalid auth token.');
    }
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

describe('JWT security boundaries', () => {
  it('rejects expired tokens', async () => {
    vi.useFakeTimers();
    try {
      const token = await createSessionToken(testUser);
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);
      const result = await verifyAuth(createRequest({ cookie: token }));
      expect(result.authenticated).toBe(false);
      expect(result.error).toMatch(/invalid|expired/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects tokens signed with wrong secret', async () => {
    const token = await createSessionToken(testUser);
    process.env.AUTH_SECRET = 'a-completely-different-secret-32-chars!!';
    _resetSecretCache();
    try {
      const result = await verifyAuth(createRequest({ cookie: token }));
      expect(result.authenticated).toBe(false);
    } finally {
      process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
      _resetSecretCache();
    }
  });
});
