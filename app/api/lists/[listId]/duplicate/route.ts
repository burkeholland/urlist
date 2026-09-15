import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { generateLinkId, generateListId, generateSlug, validateSlugFormat } from '@/lib/slug';
import {
  cleanupFailedPublish,
  createList,
  getListWithLinks,
  reserveSlug,
} from '@/lib/rtdb';
import { log } from '@/lib/logger';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_FOLDER_LENGTH,
  MAX_OG_DESCRIPTION_LENGTH,
  MAX_OG_SITE_NAME_LENGTH,
  MAX_OG_TITLE_LENGTH,
  sanitizeText,
} from '@/lib/schemas/shared';
import { z } from 'zod';

const DuplicateListSchema = z.object({
  slug: z.string().optional(),
  description: z.string().optional(),
});

async function reserveRequestedOrGeneratedSlug(slug: string | undefined, listId: string) {
  if (slug) {
    const slugValidation = validateSlugFormat(slug);
    if (!slugValidation.valid) {
      return {
        ok: false as const,
        status: 400,
        error: { code: 'INVALID_SLUG_FORMAT', message: slugValidation.error },
      };
    }
    const reserved = await reserveSlug(slug, listId);
    if (!reserved) {
      return {
        ok: false as const,
        status: 409,
        error: {
          code: 'SLUG_TAKEN',
          message: `The vanity URL '${slug}' is already in use. Please choose another.`,
        },
      };
    }
    return { ok: true as const, slug };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const generated = generateSlug();
    if (await reserveSlug(generated, listId)) {
      return { ok: true as const, slug: generated };
    }
  }

  return {
    ok: false as const,
    status: 500,
    error: {
      code: 'SLUG_GENERATION_FAILED',
      message: 'Could not generate a unique URL. Please try again.',
    },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId: sourceListId } = await params;

  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    const rateCheck = await checkRateLimit(
      authResult.uid,
      RATE_LIMITS.publishAuthenticated,
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many duplicate requests. Try again later.',
            retryAfter: rateCheck.retryAfter,
          },
        },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
      );
    }

    const bodyText = await request.text();
    let body: unknown = {};
    if (bodyText.trim()) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        return NextResponse.json(
          { error: { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' } },
          { status: 400 },
        );
      }
    }
    const parsed = DuplicateListSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const source = await getListWithLinks(sourceListId);
    if (!source) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'No list exists with this ID.' } },
        { status: 404 },
      );
    }

    if (parsed.data.description && parsed.data.description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: { code: 'DESCRIPTION_TOO_LONG', message: 'Description exceeds 280 characters.' } },
        { status: 400 },
      );
    }

    const newListId = generateListId();
    const slugResult = await reserveRequestedOrGeneratedSlug(parsed.data.slug, newListId);
    if (!slugResult.ok) {
      return NextResponse.json({ error: slugResult.error }, { status: slugResult.status });
    }

    const description = parsed.data.description ?? source.description;
    const links = [...source.links]
      .sort((a, b) => a.position - b.position)
      .map((link, position) => ({
        id: generateLinkId(),
        url: link.url,
        position,
        pinned: link.pinned ?? false,
        folder: sanitizeText(link.folder, MAX_FOLDER_LENGTH),
        ogTitle: sanitizeText(link.ogTitle, MAX_OG_TITLE_LENGTH),
        ogDescription: sanitizeText(link.ogDescription, MAX_OG_DESCRIPTION_LENGTH),
        ogImage: link.ogImage,
        ogSiteName: sanitizeText(link.ogSiteName, MAX_OG_SITE_NAME_LENGTH),
      }));

    try {
      await createList({
        listId: newListId,
        slug: slugResult.slug,
        description: description.slice(0, MAX_DESCRIPTION_LENGTH),
        ownerId: authResult.uid,
        links,
      });
    } catch (error) {
      await cleanupFailedPublish({ listId: newListId, slug: slugResult.slug, ownerId: authResult.uid });
      log({
        level: 'error',
        message: 'List duplicate failed, artifacts compensated',
        service: 'api-lists',
        data: { sourceListId, newListId, slug: slugResult.slug, error: String(error) },
      });
      throw error;
    }

    log({
      level: 'info',
      message: 'List duplicated',
      service: 'api-lists',
      data: {
        sourceListId,
        newListId,
        linkCount: links.length,
      },
    });

    return NextResponse.json(
      {
        listId: newListId,
        slug: slugResult.slug,
        publicUrl: `/${slugResult.slug}`,
        createdAt: Date.now(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 },
      );
    }
    throw error;
  }
}
