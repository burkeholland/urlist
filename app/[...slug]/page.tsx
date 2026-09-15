import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { headers } from 'next/headers';
import { getListWithLinks, resolveSlug } from '@/lib/rtdb';
import { buildListPageMetadata } from '@/lib/list-metadata';
import { getRequestOrigin } from '@/lib/site-url';
import { PublicListClient } from './client';

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  noStore();

  const { slug: slugSegments } = await params;
  const slug = slugSegments.join('/');

  const listId = await resolveSlug(slug);
  if (!listId) {
    return { title: 'List Not Found — The Urlist' };
  }

  const list = await getListWithLinks(listId);
  if (!list) {
    return { title: 'List Not Found — The Urlist' };
  }

  const headerStore = await headers();
  return buildListPageMetadata(list, slug, getRequestOrigin(headerStore));
}

export default async function PublicListPage({ params, searchParams }: PageProps) {
  noStore();

  const { slug: slugSegments } = await params;
  const slug = slugSegments.join('/');
  const search = await searchParams;
  const justPublished = search.published === 'true';

  const listId = await resolveSlug(slug);
  if (!listId) {
    notFound();
  }

  const list = await getListWithLinks(listId);
  if (!list) {
    notFound();
  }

  return <PublicListClient list={list} slug={slug} justPublished={justPublished} />;
}
