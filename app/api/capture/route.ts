import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyAuth } from '@/lib/auth';
import { getDb } from '@/lib/cosmos';
import { getLinks } from '@/lib/rtdb';
import { normalizeCapturedUrl, isValidHttpUrl } from '@/lib/url';
import { generateLinkId } from '@/lib/slug';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { log } from '@/lib/logger';
import type { ListRecord } from '@/lib/types';
import {
  MAX_LINKS,
  MAX_OG_DESCRIPTION_LENGTH,
  MAX_OG_SITE_NAME_LENGTH,
  MAX_OG_TITLE_LENGTH,
  sanitizeText,
} from '@/lib/schemas/shared';

const CaptureRequestSchema = z.object({
  listId: z.string().min(1),
  updatedAt: z.number(),
  url: z.string().min(1),
  ogTitle: z.string().nullable().optional(),
  ogDescription: z.string().nullable().optional(),
  ogImage: z.string().nullable().optional(),
  ogSiteName: z.string().nullable().optional(),
  duplicateAction: z.enum(['reject', 'allow']).optional().default('reject'),
});

function isCosmosStatusCode(error: unknown, statusCode: number): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === statusCode;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    requireAuth(authResult);

    const rateCheck = await checkRateLimit(authResult.uid, RATE_LIMITS.publishAuthenticated);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many capture requests. Try again later.',
            retryAfter: rateCheck.retryAfter,
          },
        },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = CaptureRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: parsed.error.issues[0]?.message || 'Invalid capture request.',
          },
        },
        { status: 400 },
      );
    }

    const normalized = normalizeCapturedUrl(parsed.data.url);
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

    const db = getDb();
    const listItem = db.container('lists').item(parsed.data.listId, parsed.data.listId);
    const { resource } = await listItem.read<(ListRecord & { id: string }) & { _etag: string }>();
    if (!resource) {
      return NextResponse.json(
        { error: { code: 'LIST_NOT_FOUND', message: 'List does not exist.' } },
        { status: 404 },
      );
    }

    const { _etag, ...list } = resource;

    if (list.ownerId !== authResult.uid) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You are not the owner of this list.' } },
        { status: 403 },
      );
    }

    if (list.updatedAt !== parsed.data.updatedAt) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'List was modified since your capture started. Refresh and try again.',
          },
        },
        { status: 409 },
      );
    }

    const existingLinks = await getLinks(parsed.data.listId);
    if (existingLinks.length >= MAX_LINKS) {
      return NextResponse.json(
        {
          error: {
            code: 'TOO_MANY_LINKS',
            message: `List exceeds the maximum of ${MAX_LINKS} links`,
          },
        },
        { status: 400 },
      );
    }

    const duplicate = existingLinks.find((link) => link.url === normalized.url);
    if (duplicate && parsed.data.duplicateAction !== 'allow') {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_URL',
            message: 'That URL is already in this list. Choose whether to keep the existing copy or add another.',
          },
          duplicate: {
            linkId: duplicate.id,
            url: duplicate.url,
            title: duplicate.ogTitle,
          },
        },
        { status: 409 },
      );
    }

    const createdAt = Date.now();
    const linkId = generateLinkId();
    const linkContainer = db.container('links');

    await linkContainer.items.create({
      id: linkId,
      listId: parsed.data.listId,
      url: normalized.url,
      position: existingLinks.length,
      pinned: false,
      ogTitle: sanitizeText(parsed.data.ogTitle, MAX_OG_TITLE_LENGTH),
      ogDescription: sanitizeText(parsed.data.ogDescription, MAX_OG_DESCRIPTION_LENGTH),
      ogImage: parsed.data.ogImage && isValidHttpUrl(parsed.data.ogImage) ? parsed.data.ogImage : null,
      ogSiteName: sanitizeText(parsed.data.ogSiteName, MAX_OG_SITE_NAME_LENGTH),
      createdAt,
    });

    try {
      await listItem.patch(
        [{ op: 'set', path: '/updatedAt', value: createdAt }],
        { accessCondition: { type: 'IfMatch', condition: _etag } },
      );
    } catch (error) {
      await linkContainer.item(linkId, parsed.data.listId).delete().catch((deleteError) => {
        log({
          level: 'warn',
          message: 'Failed to compensate captured link after list update error',
          service: 'api-capture',
          data: { listId: parsed.data.listId, linkId, error: String(deleteError) },
        });
      });

      if (isCosmosStatusCode(error, 412)) {
        return NextResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'List was modified since your capture started. Refresh and try again.',
            },
          },
          { status: 409 },
        );
      }

      throw error;
    }

    log({
      level: 'info',
      message: 'Link captured',
      service: 'api-capture',
      data: {
        listId: parsed.data.listId,
        duplicateAllowed: !!duplicate,
      },
    });

    return NextResponse.json(
      {
        listId: parsed.data.listId,
        publicUrl: `/${list.slug}`,
        editUrl: `/app/compose/${parsed.data.listId}`,
        updatedAt: createdAt,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: 'Sign in to save links to your lists.' } },
        { status: 401 },
      );
    }
    throw error;
  }
}
