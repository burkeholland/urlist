import React from 'react';
import { ImageResponse } from 'next/og';
import { getListWithLinks, resolveSlug } from '@/lib/rtdb';
import {
  buildOpenGraphImageModel,
  OpenGraphImageMarkup,
  openGraphImageAlt,
  openGraphImageContentType,
  openGraphImageSize,
} from '@/lib/opengraph-image';

export const alt = openGraphImageAlt;
export const size = openGraphImageSize;
export const contentType = openGraphImageContentType;
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join('/');
  const listId = await resolveSlug(slug);
  const list = listId ? await getListWithLinks(listId) : null;
  const model = buildOpenGraphImageModel(slug, list);

  return new ImageResponse(
    React.createElement(OpenGraphImageMarkup, model),
    openGraphImageSize,
  );
}
