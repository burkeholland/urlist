import { NextRequest, NextResponse } from 'next/server';
import { validateSlugFormat } from '@/lib/slug';
import { isSlugAvailable } from '@/lib/rtdb';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(ip, RATE_LIMITS.slugCheck);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: rateCheck.retryAfter,
        },
      },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
    );
  }

  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const validation = validateSlugFormat(slug);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_SLUG_FORMAT',
          message: validation.error || 'Invalid slug format.',
        },
      },
      { status: 400 },
    );
  }

  const available = await isSlugAvailable(slug);
  return NextResponse.json({ slug, available });
}
