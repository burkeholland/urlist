import { NextRequest, NextResponse } from 'next/server';
import {
  createListAccessToken,
  getListAccessCookieName,
  LIST_ACCESS_MAX_AGE_SECONDS,
} from '@/lib/auth';
import { resolveSlug, getListAccessRecord } from '@/lib/rtdb';
import { checkRateLimit, getClientIp, RATE_LIMITS, reserveRateLimit } from '@/lib/rate-limiter';
import { verifyListPassword } from '@/lib/password';
import { validateSlugFormat } from '@/lib/slug';
import { UnlockListSchema } from '@/lib/schemas/shared';

const INVALID_UNLOCK_RESPONSE = {
  error: { code: 'INVALID_PASSWORD', message: 'Unable to unlock this list.' },
};

function invalidUnlockResponse() {
  return NextResponse.json(INVALID_UNLOCK_RESPONSE, { status: 401 });
}

function rateLimitResponse(retryAfter: number) {
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
  const parsed = UnlockListSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !validateSlugFormat(parsed.data.slug).valid) {
    return invalidUnlockResponse();
  }
  const { slug, password } = parsed.data;

  const ip = getClientIp(request);
  const clientCheck = await checkRateLimit(ip, RATE_LIMITS.passwordUnlockClient);
  if (!clientCheck.allowed) {
    return rateLimitResponse(clientCheck.retryAfter!);
  }

  const listId = await resolveSlug(slug);
  const record = listId ? await getListAccessRecord(listId) : null;
  if (!listId || !record || record.list.visibility !== 'password-protected' || !record.passwordHash) {
    return invalidUnlockResponse();
  }

  // Keyed by listId so slug aliases share one budget. Slots are held while the password is
  // checked, so parallel guesses still count, and handed back on success so only failures count.
  const clientAttempt = reserveRateLimit(`${ip}:${listId}`, RATE_LIMITS.passwordUnlock);
  if (!clientAttempt.allowed) {
    return rateLimitResponse(clientAttempt.retryAfter!);
  }
  const listAttempt = reserveRateLimit(listId, RATE_LIMITS.passwordUnlockList);
  if (!listAttempt.allowed) {
    clientAttempt.release();
    return rateLimitResponse(listAttempt.retryAfter!);
  }

  const valid = await verifyListPassword(password, record.passwordHash);
  if (!valid) {
    return invalidUnlockResponse();
  }
  clientAttempt.release();
  listAttempt.release();

  const token = await createListAccessToken({
    listId,
    passwordUpdatedAt: record.passwordUpdatedAt,
  });
  const response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(getListAccessCookieName(listId), token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: LIST_ACCESS_MAX_AGE_SECONDS,
    path: '/',
  });
  return response;
}
