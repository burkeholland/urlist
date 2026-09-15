import { NextRequest, NextResponse } from 'next/server';
import {
  exportContentType,
  serializeCollection,
  type ExportFormat,
} from '@/lib/collection-io';
import { getListWithLinks } from '@/lib/rtdb';

const EXPORT_FORMATS = new Set<ExportFormat>(['json', 'csv', 'html']);

function safeFilename(slug: string, format: ExportFormat): string {
  const base = slug.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'collection';
  return `urlist-${base}.${format}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;
  const formatParam = new URL(request.url).searchParams.get('format') ?? 'json';
  if (!EXPORT_FORMATS.has(formatParam as ExportFormat)) {
    return NextResponse.json(
      { error: { code: 'INVALID_FORMAT', message: 'Export format must be json, csv, or html.' } },
      { status: 400 },
    );
  }

  const list = await getListWithLinks(listId);
  if (!list) {
    return NextResponse.json(
      { error: { code: 'LIST_NOT_FOUND', message: 'No list exists with this ID.' } },
      { status: 404 },
    );
  }

  const format = formatParam as ExportFormat;
  return new NextResponse(serializeCollection(list, format), {
    headers: {
      'Content-Type': exportContentType(format),
      'Content-Disposition': `attachment; filename="${safeFilename(list.slug, format)}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
