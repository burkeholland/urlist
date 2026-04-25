import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { getListWithLinks, resolveSlug } from '@/lib/rtdb';
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

  return {
    title: `${slug} — The Urlist`,
    description: list.description || `A curated list of ${list.links.length} links`,
    openGraph: {
      title: `${slug} — The Urlist`,
      description: list.description || `A curated list of ${list.links.length} links`,
      url: `/${slug}`,
    },
  };
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
