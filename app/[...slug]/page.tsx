import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { getListWithLinks, resolveSlug } from '@/lib/rtdb';
import { getPublicRenderOptions } from '@/lib/embed';
import { PublicListClient } from './client';

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  noStore();

  const { slug: slugSegments } = await params;
  const slug = slugSegments.join('/');
  const renderOptions = getPublicRenderOptions(await searchParams);

  const listId = await resolveSlug(slug);
  if (!listId) {
    return { title: 'List Not Found — The Urlist' };
  }

  const list = await getListWithLinks(listId);
  if (!list) {
    return { title: 'List Not Found — The Urlist' };
  }

  const description = list.description || `A curated list of ${list.links.length} links`;
  const title = renderOptions.isEmbed
    ? `${slug} embed — The Urlist`
    : `${slug} — The Urlist`;

  return {
    title,
    description,
    alternates: {
      canonical: `/${slug}`,
    },
    robots: renderOptions.isEmbed ? { index: false, follow: false } : undefined,
    openGraph: renderOptions.isEmbed
      ? undefined
      : {
          title,
          description,
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
  const renderOptions = getPublicRenderOptions(search);

  const listId = await resolveSlug(slug);
  if (!listId) {
    notFound();
  }

  const list = await getListWithLinks(listId);
  if (!list) {
    notFound();
  }

  return (
    <PublicListClient
      list={list}
      slug={slug}
      justPublished={justPublished}
      renderOptions={renderOptions}
    />
  );
}
