import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CollectionImportError,
  IMPORT_FORMATS,
  parseCollectionImport,
} from '@/lib/collection-io';
import { MAX_LINKS } from '@/lib/schemas/shared';

const ImportPreviewRequestSchema = z.object({
  content: z.string(),
  format: z.enum(IMPORT_FORMATS).or(z.literal('auto')).optional(),
  existingUrls: z.array(z.string()).max(MAX_LINKS).optional(),
  currentLinkCount: z.number().int().min(0).max(MAX_LINKS).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = ImportPreviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: parsed.error.issues[0].message,
        },
      },
      { status: 400 },
    );
  }

  try {
    const preview = parseCollectionImport(parsed.data.content, {
      format: parsed.data.format,
      existingUrls: parsed.data.existingUrls,
      currentLinkCount: parsed.data.currentLinkCount,
    });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof CollectionImportError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 },
      );
    }
    throw error;
  }
}
