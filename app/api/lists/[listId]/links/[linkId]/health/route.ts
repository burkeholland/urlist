import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { checkLinkHealth, buildDismissedHealthUpdate } from '@/lib/link-health';
import { getList, getListWithLinks, updateLinkHealth } from '@/lib/rtdb';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';
import { log } from '@/lib/logger';

const DESTINATION_COOLDOWN_MS = 60_000;
const destinationLastChecked = new Map<string, number>();
const destinationInFlight = new Map<string, Promise<unknown>>();

const RequestSchema = z.object({
  action: z.enum(['recheck', 'dismiss']).default('recheck'),
  refreshMetadata: z.boolean().optional().default(true),
  confirmMetadataOverwrite: z.boolean().optional().default(false),
});

function destinationKey(url: string): string {
  return url.trim().toLowerCase();
}

function retryAfterSeconds(lastChecked: number, now: number): number {
  return Math.max(1, Math.ceil((DESTINATION_COOLDOWN_MS - (now - lastChecked)) / 1000));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; linkId: string }> },
) {
  const { listId, linkId } = await params;
  let currentInFlightKey: string | null = null;

  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit(
      authResult.uid ?? ip,
      RATE_LIMITS.linkHealthManual,
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many link checks. Please try again later.',
            retryAfter: rateCheck.retryAfter,
          },
        },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const list = await getList(listId);
    if (!list) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'List does not exist.' } },
        { status: 404 },
      );
    }
    if (list.ownerId !== authResult.uid) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You are not the owner of this list.' } },
        { status: 403 },
      );
    }

    const listWithLinks = await getListWithLinks(listId);
    const link = listWithLinks?.links.find((candidate) => candidate.id === linkId);
    if (!link) {
      return NextResponse.json(
        { error: { code: 'LINK_NOT_FOUND', message: 'Link does not exist.' } },
        { status: 404 },
      );
    }

    if (parsed.data.action === 'dismiss') {
      const update = buildDismissedHealthUpdate();
      await updateLinkHealth({ listId, linkId, updates: update });
      return NextResponse.json({ data: { linkId, ...update } });
    }

    const key = destinationKey(link.url);
    const now = Date.now();
    const lastChecked = destinationLastChecked.get(key);
    if (lastChecked && now - lastChecked < DESTINATION_COOLDOWN_MS) {
      const retryAfter = retryAfterSeconds(lastChecked, now);
      return NextResponse.json(
        {
          error: {
            code: 'DESTINATION_RATE_LIMITED',
            message: 'This destination was checked recently. Please try again shortly.',
            retryAfter,
          },
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const inFlight = destinationInFlight.get(key);
    if (inFlight) await inFlight;

    const checkPromise = checkLinkHealth(link, {
      refreshMetadata: parsed.data.refreshMetadata,
      confirmMetadataOverwrite: parsed.data.confirmMetadataOverwrite,
    });
    destinationInFlight.set(key, checkPromise);
    currentInFlightKey = key;
    const update = await checkPromise;
    destinationLastChecked.set(key, Date.now());
    await updateLinkHealth({
      listId,
      linkId,
      updates: {
        ...update,
        healthDismissedAt: null,
      },
    });

    log({
      level: 'info',
      message: 'Link health checked',
      service: 'api-link-health',
      data: { listId, linkId, status: update.healthStatus, reason: update.healthReason },
    });

    return NextResponse.json({ data: { linkId, ...update, healthDismissedAt: null } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  } finally {
    if (currentInFlightKey) {
      destinationInFlight.delete(currentInFlightKey);
    }
  }
}
