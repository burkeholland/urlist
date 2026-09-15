import { NextRequest, NextResponse } from 'next/server';
import {
  createListAccessToken,
  getListAccessCookieName,
  LIST_ACCESS_MAX_AGE_SECONDS,
} from '@/lib/auth';
import { resolveSlug, getList, getListPasswordAccess } from '@/lib/rtdb';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';
import { verifyListPassword } from '@/lib/password';
import { MAX_LIST_PASSWORD_LENGTH } from '@/lib/schemas/shared';

const INVALID_UNLOCK_RESPONSE = {
  error: { code: 'INVALID_PASSWORD', message: 'Unable to unlock this list.' },
};

function rateLimitResponse(retryAfter = RATE_LIMITS.passwordUnlock.windowSeconds) {
  return NextResponse.json(
    {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many unlock attempts. Try again later.',
        retryAfter,
      },
    },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const slug = body && typeof body === 'object' && typeof body.slug === 'string' ? body.slug : '';
  const password = body && typeof body === 'object' && typeof body.password === 'string' ? body.password : '';

  if (!slug || !password || password.length > MAX_LIST_PASSWORD_LENGTH) {
    return NextResponse.json(INVALID_UNLOCK_RESPONSE, { status: 401 });
  }

  const ip = getClientIp(request);
  const clientRateCheck = await checkRateLimit(`${ip}:${slug}`, RATE_LIMITS.passwordUnlock);
  if (!clientRateCheck.allowed) {
    return rateLimitResponse(clientRateCheck.retryAfter);
  }

  const listRateCheck = await checkRateLimit(slug, RATE_LIMITS.passwordUnlockList);
  if (!listRateCheck.allowed) {
    return rateLimitResponse(listRateCheck.retryAfter);
  }

  const listId = await resolveSlug(slug);
  const list = listId ? await getList(listId) : null;
  const access = listId ? await getListPasswordAccess(listId) : null;
  if (!listId || !list || !access || list.visibility !== 'password-protected' || !access.passwordHash) {
    return NextResponse.json(INVALID_UNLOCK_RESPONSE, { status: 401 });
  }

  const valid = await verifyListPassword(password, access.passwordHash);
  if (!valid) {
    return NextResponse.json(INVALID_UNLOCK_RESPONSE, { status: 401 });
  }

  const token = await createListAccessToken({
    listId,
    passwordUpdatedAt: access.passwordUpdatedAt,
  });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(getListAccessCookieName(listId), token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: LIST_ACCESS_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
