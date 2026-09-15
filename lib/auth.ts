import { jwtVerify, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const COOKIE_NAME = 'session';
export const LIST_ACCESS_MAX_AGE_SECONDS = 2 * 60 * 60;
const LIST_ACCESS_COOKIE_PREFIX = 'list_access_';

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

const ListAccessPayloadSchema = z.object({
  listId: z.string().min(1).max(128),
  passwordUpdatedAt: z.number().int().nonnegative(),
});

export interface AuthUser {
  uid: string;
  username: string;
  name: string;
  avatar: string;
}

export interface AuthResult {
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

export async function verifySessionToken(token: string): Promise<AuthResult> {
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

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  const authHeader = request.headers.get('Authorization');
  const headerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return { authenticated: false, uid: null };
  }

  return verifySessionToken(token);
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

export function getListAccessCookieName(listId: string): string {
  return `${LIST_ACCESS_COOKIE_PREFIX}${listId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export async function createListAccessToken(params: {
  listId: string;
  passwordUpdatedAt: number;
}): Promise<string> {
  return new SignJWT({
    listId: params.listId,
    passwordUpdatedAt: params.passwordUpdatedAt,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${LIST_ACCESS_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyListAccessToken(
  token: string | undefined,
  listId: string,
  passwordUpdatedAt: number,
): Promise<boolean> {
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const parsed = ListAccessPayloadSchema.safeParse(payload);
    return parsed.success
      && parsed.data.listId === listId
      && parsed.data.passwordUpdatedAt === passwordUpdatedAt;
  } catch {
    return false;
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
