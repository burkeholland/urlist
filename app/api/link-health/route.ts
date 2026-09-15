import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth';
import { checkLinkHealth, type LinkHealthUpdate } from '@/lib/link-health';
import { getList, getListsWithLinks, getUserListIds, updateLinkHealth } from '@/lib/rtdb';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';
import type { LinkWithId, ListWithLinks } from '@/lib/types';

const MAX_JOB_LINKS = 50;

const JobSchema = z.object({
  listId: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_JOB_LINKS).optional().default(25),
  includeNotDue: z.boolean().optional().default(false),
});

function isDue(link: LinkWithId, now: number): boolean {
  return link.healthStatus === undefined ||
    link.healthStatus === 'unchecked' ||
    link.healthNextCheckAt === null ||
    link.healthNextCheckAt === undefined ||
    link.healthNextCheckAt <= now;
}

function healthOnly(update: LinkHealthUpdate): LinkHealthUpdate {
  return {
    healthStatus: update.healthStatus,
    healthReason: update.healthReason,
    healthCheckedAt: update.healthCheckedAt,
    healthFinalUrl: update.healthFinalUrl,
    healthHttpStatus: update.healthHttpStatus,
    healthFailureCount: update.healthFailureCount,
    healthNextCheckAt: update.healthNextCheckAt,
    metadataRefreshedAt: update.metadataRefreshedAt,
    metadataRefreshStatus: update.metadataRefreshStatus,
  };
}

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if (!authResult.authenticated || !authResult.uid) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to check your links.' } },
      { status: 401 },
    );
  }

  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(authResult.uid ?? ip, RATE_LIMITS.linkHealthJob);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many link health jobs. Please try again later.',
          retryAfter: rateCheck.retryAfter,
        },
      },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = JobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0].message } },
      { status: 400 },
    );
  }

  let lists: ListWithLinks[];
  if (parsed.data.listId) {
    const list = await getList(parsed.data.listId);
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
    const full = await getListsWithLinks([parsed.data.listId]);
    lists = full;
  } else {
    const listIds = await getUserListIds(authResult.uid);
    lists = await getListsWithLinks(listIds);
  }

  const now = Date.now();
  const candidates = lists
    .flatMap((list) => list.links.map((link) => ({ listId: list.listId, link })))
    .filter(({ link }) => parsed.data.includeNotDue || isDue(link, now))
    .slice(0, parsed.data.limit);

  const results: Array<{
    listId: string;
    linkId: string;
    url: string;
    status: string;
    reason: string;
  }> = [];
  const checkedByUrl = new Map<string, LinkHealthUpdate>();

  for (const candidate of candidates) {
    const key = candidate.link.url.trim().toLowerCase();
    const update = checkedByUrl.get(key) ?? await checkLinkHealth(candidate.link, { now });
    checkedByUrl.set(key, update);
    const persistedUpdate = checkedByUrl.get(key) === update && results.some((r) => r.url === candidate.link.url)
      ? healthOnly(update)
      : update;

    await updateLinkHealth({
      listId: candidate.listId,
      linkId: candidate.link.id,
      updates: { ...persistedUpdate, healthDismissedAt: null },
    });
    results.push({
      listId: candidate.listId,
      linkId: candidate.link.id,
      url: candidate.link.url,
      status: update.healthStatus,
      reason: update.healthReason,
    });
  }

  return NextResponse.json({
    data: {
      checked: results.length,
      deduplicatedDestinations: checkedByUrl.size,
      attentionNeeded: results.filter((r) => ['redirected', 'transient', 'broken'].includes(r.status)).length,
      results,
      scheduling: 'Manual bounded job only; no durable scheduler is configured in this repository.',
    },
  });
}
