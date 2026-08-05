import { jwtVerify, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const COOKIE_NAME = 'session';

// Lazy-initialized secret — throws on first use if AUTH_SECRET is missing
let _secret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!_secret) {
    const raw = process.env.AUTH_SECRET;
    if (!raw || raw.length < 32) {
      throw new Error('AUTH_SECRET environment variable must be set (min 32 chars). Generate with: openssl rand -base64 32');
    }
    _secret = new TextEncoder().encode(raw);
  }
  return _secret;
}

/** Reset cached secret (for testing only). */
export function _resetSecretCache(): void {
  _secret = null;
}

const JwtPayloadSchema = z.object({
  uid: z.string().min(1).max(128),
  username: z.string().min(1).max(100),
  name: z.string().max(200).optional().default(''),
  avatar: z.string().max(2048).optional().default(''),
});

interface AuthUser {
  uid: string;
  username: string;
  name: string;
  avatar: string;
}

interface AuthResult {
  authenticated: boolean;
  uid: string | null;
  error?: string;
}

export async function createSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({ uid: user.uid, username: user.username, name: user.name, avatar: user.avatar })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  const authHeader = request.headers.get('Authorization');
  const headerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return { authenticated: false, uid: null };
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const parsed = JwtPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { authenticated: false, uid: null, error: 'Malformed session token.' };
    }
    return { authenticated: true, uid: parsed.data.uid };
  } catch {
    return { authenticated: false, uid: null, error: 'Invalid or expired session.' };
  }
}

export async function getSessionUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const parsed = JwtPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;
    return {
      uid: parsed.data.uid,
      username: parsed.data.username,
      name: parsed.data.name || parsed.data.username,
      avatar: parsed.data.avatar,
    };
  } catch {
    return null;
  }
}

export function requireAuth(authResult: AuthResult): asserts authResult is AuthResult & { authenticated: true; uid: string } {
  if (!authResult.authenticated) {
    throw new AuthError('UNAUTHORIZED', 'Missing or invalid auth token.');
  }
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
  }
}
