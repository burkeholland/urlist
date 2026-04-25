import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scrapeOgMetadata } from '@/lib/og-scraper';
import { normalizeUrl } from '@/lib/url';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';

const RequestSchema = z.object({
  url: z.string().min(1),
});

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(ip, RATE_LIMITS.ogScrape);
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

  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_URL', message: 'A valid URL is required.' } },
      { status: 400 },
    );
  }

  const normalized = normalizeUrl(parsed.data.url);
  if (!normalized.valid) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_URL',
          message: normalized.error || 'Invalid URL.',
        },
      },
      { status: 400 },
    );
  }

  const metadata = await scrapeOgMetadata(normalized.url);
  return NextResponse.json(metadata);
}
