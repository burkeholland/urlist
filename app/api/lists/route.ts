import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import {
  validateSlugFormat,
  generateSlug,
  generateListId,
  generateLinkId,
} from '@/lib/slug';
import { normalizeUrl, isValidHttpUrl } from '@/lib/url';
import { reserveSlug, cleanupFailedPublish, createList, getUserListIds, getListsWithLinks } from '@/lib/rtdb';
import { getListAnalyticsSummary } from '@/lib/analytics';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limiter';
import { log } from '@/lib/logger';
import {
  CreateListSchema,
  sanitizeText,
  MAX_OG_TITLE_LENGTH,
  MAX_OG_DESCRIPTION_LENGTH,
  MAX_OG_SITE_NAME_LENGTH,
} from '@/lib/schemas/shared';

export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if (!authResult.authenticated || !authResult.uid) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Sign in to view your lists.' } },
      { status: 401 },
    );
  }

  const listIds = await getUserListIds(authResult.uid);
  const lists = await getListsWithLinks(listIds);

  const { searchParams } = new URL(request.url);
  const includeStats = searchParams.get('includeStats') === 'true';

  if (includeStats) {
    const listsWithStats = await Promise.all(
      lists.map(async (list) => {
        const stats = await getListAnalyticsSummary(list.slug).catch(() => ({
          totalViews: 0,
          totalClicks: 0,
        }));
        return { ...list, stats };
      }),
    );
    return NextResponse.json(listsWithStats);
  }

  return NextResponse.json(lists);
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const authResult = await verifyAuth(request);

  // Rate limiting
  const rateConfig = authResult.authenticated
    ? RATE_LIMITS.publishAuthenticated
    : RATE_LIMITS.publishAnonymous;
  const rateCheck = await checkRateLimit(
    authResult.authenticated ? authResult.uid! : ip,
    rateConfig,
  );
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many publish requests. Try again later.',
          retryAfter: rateCheck.retryAfter,
        },
      },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateListSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    let code = 'INVALID_REQUEST';
    const message = firstError?.message || 'Invalid request body.';

    if (firstError?.path?.includes('links')) {
      if (firstError.message.includes('at least')) {
        code = 'NO_LINKS';
      } else if (firstError.message.includes('maximum')) {
        code = 'TOO_MANY_LINKS';
      }
    }

    return NextResponse.json({ error: { code, message } }, { status: 400 });
  }

  const { description, links } = parsed.data;
  const isCustomSlug = !!parsed.data.slug;
  let slug = parsed.data.slug || '';

  // Validate description
  if (description.length > 280) {
    return NextResponse.json(
      {
        error: {
          code: 'DESCRIPTION_TOO_LONG',
          message: 'Description exceeds 280 characters.',
        },
      },
      { status: 400 },
    );
  }

  // Validate custom slug format
  if (isCustomSlug) {
    const slugValidation = validateSlugFormat(slug);
    if (!slugValidation.valid) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_SLUG_FORMAT',
            message: slugValidation.error || 'Invalid slug format.',
          },
        },
        { status: 400 },
      );
    }
  }

  // Validate all URLs
  for (const link of links) {
    const urlResult = normalizeUrl(link.url);
    if (!urlResult.valid) {
      return NextResponse.json(
        { error: { code: 'INVALID_URL', message: `Invalid URL: ${link.url}` } },
        { status: 400 },
      );
    }
    link.url = urlResult.url;
  }

  // Reserve slug atomically
  const listId = generateListId();
  let reserved = false;

  if (isCustomSlug) {
    reserved = await reserveSlug(slug, listId);
    if (!reserved) {
      return NextResponse.json(
        {
          error: {
            code: 'SLUG_TAKEN',
            message: `The vanity URL '${slug}' is already in use. Please choose another.`,
          },
        },
        { status: 409 },
      );
    }
  } else {
    // Auto-generated slug: retry on collision (up to 5 attempts)
    const MAX_SLUG_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      slug = generateSlug();
      reserved = await reserveSlug(slug, listId);
      if (reserved) break;
    }
    if (!reserved) {
      return NextResponse.json(
        {
          error: {
            code: 'SLUG_GENERATION_FAILED',
            message: 'Could not generate a unique URL. Please try again.',
          },
        },
        { status: 500 },
      );
    }
  }

  // Sanitize OG metadata and prepare links
  const sanitizedLinks = links.map((link) => ({
    id: generateLinkId(),
    url: link.url,
    position: link.position,
    pinned: link.pinned ?? false,
    ogTitle: sanitizeText(link.ogTitle, MAX_OG_TITLE_LENGTH),
    ogDescription: sanitizeText(link.ogDescription, MAX_OG_DESCRIPTION_LENGTH),
    ogImage: link.ogImage && isValidHttpUrl(link.ogImage) ? link.ogImage : null,
    ogSiteName: sanitizeText(link.ogSiteName, MAX_OG_SITE_NAME_LENGTH),
  }));

  // Write to database — clean up all artifacts if createList fails
  try {
    await createList({
      listId,
      slug,
      description: description.slice(0, 280),
      ownerId: authResult.uid,
      links: sanitizedLinks,
    });
  } catch (error) {
    await cleanupFailedPublish({ listId, slug, ownerId: authResult.uid });
    log({
      level: 'error',
      message: 'List creation failed, artifacts compensated',
      service: 'api-lists',
      data: { listId, slug, error: String(error) },
    });
    throw error;
  }

  log({
    level: 'info',
    message: 'List published',
    service: 'api-lists',
    data: {
      listId,
      slug,
      linkCount: links.length,
      anonymous: !authResult.authenticated,
    },
  });

  return NextResponse.json(
    { listId, slug, publicUrl: `/${slug}`, createdAt: Date.now() },
    { status: 201 },
  );
}
