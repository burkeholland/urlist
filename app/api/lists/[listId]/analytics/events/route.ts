import { NextRequest, NextResponse } from 'next/server';
import { recordPageView, recordLinkClick, hashVisitorId } from '@/lib/analytics';
import { getList } from '@/lib/rtdb';
import { getClientIp, checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { log } from '@/lib/logger';
import type { TrackEventPayload } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;

  // Verify list exists
  const list = await getList(listId);
  if (!list) {
    return NextResponse.json(
      { error: { code: 'LIST_NOT_FOUND', message: 'No list exists with this ID.' } },
      { status: 404 },
    );
  }

  // Rate limit per IP
  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(ip, RATE_LIMITS.slugCheck);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' } },
      { status: 429 },
    );
  }

  // Parse body
  let body: TrackEventPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  // Validate payload
  if (body.type !== 'pageView' && body.type !== 'linkClick') {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'type must be "pageView" or "linkClick".' } },
      { status: 400 },
    );
  }

  if (body.type === 'linkClick' && !body.linkId) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'linkId is required for linkClick events.' } },
      { status: 400 },
    );
  }

  const userAgent = request.headers.get('user-agent') || '';
  const visitorId = await hashVisitorId(ip, userAgent);
  const country = request.headers.get('cf-ipcountry') || null;

  try {
    if (body.type === 'pageView') {
      await recordPageView({
        slug: list.slug,
        visitorId,
        referrer: body.referrer ?? null,
        utmSource: body.utmSource ?? null,
        utmMedium: body.utmMedium ?? null,
        utmCampaign: body.utmCampaign ?? null,
        country,
      });
    } else {
      await recordLinkClick({
        slug: list.slug,
        linkId: body.linkId,
        visitorId,
        referrer: body.referrer ?? null,
      });
    }
  } catch (err) {
    log({
      level: 'error',
      message: 'Failed to record analytics event',
      service: 'analytics-events',
      data: { listId, type: body.type, error: String(err) },
    });
    // Don't expose errors to the client — analytics should be transparent
  }

  return new NextResponse(null, { status: 204 });
}
