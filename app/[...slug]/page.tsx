import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { cookies } from 'next/headers';
import { cookieStoreHasListAccess, listRequiresPassword } from '@/lib/list-access';
import { getLinks, getListAccessRecord, resolveSlug } from '@/lib/rtdb';
import { PublicListClient } from './client';
import { ProtectedListUnlock } from './unlock-client';

// Force dynamic rendering (no caching)
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// generateMetadata and the page render in the same request, so share their Cosmos reads.
const loadList = cache(async (slug: string) => {
  const listId = await resolveSlug(slug);
  if (!listId) return null;
  const record = await getListAccessRecord(listId);
  return record ? { listId, ...record } : null;
});

const loadLinks = cache((listId: string) => getLinks(listId));

const PROTECTED_TITLE = 'Password required — The Urlist';
const PROTECTED_DESCRIPTION = 'This link collection is password protected.';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  noStore();

  const { slug: slugSegments } = await params;
  const slug = slugSegments.join('/');

  const entry = await loadList(slug);
  if (!entry) {
    return { title: 'List Not Found — The Urlist' };
  }

  // Generic even for the owner or unlocked visitors, so link previews never carry list details.
  if (listRequiresPassword(entry.list)) {
    return {
      title: PROTECTED_TITLE,
      description: PROTECTED_DESCRIPTION,
      robots: { index: false, follow: false },
      openGraph: {
        title: PROTECTED_TITLE,
        description: PROTECTED_DESCRIPTION,
        url: `/${slug}`,
      },
    };
  }

  const { list } = entry;
  const links = await loadLinks(entry.listId);
  const robots = list.visibility === 'unlisted'
    ? { index: false, follow: false }
    : undefined;

  return {
    title: `${slug} — The Urlist`,
    description: list.description || `A curated list of ${links.length} links`,
    robots,
    openGraph: {
      title: `${slug} — The Urlist`,
      description: list.description || `A curated list of ${links.length} links`,
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

  const entry = await loadList(slug);
  if (!entry) {
    notFound();
  }

  const { listId, list } = entry;
  if (listRequiresPassword(list)) {
    const hasAccess = await cookieStoreHasListAccess(await cookies(), listId, entry);
    if (!hasAccess) {
      // Only the canonical slug is passed down; no list details reach a locked visitor.
      return <ProtectedListUnlock slug={list.slug} />;
    }
  }

  const links = await loadLinks(listId);
  return <PublicListClient list={{ listId, ...list, links }} slug={slug} justPublished={justPublished} />;
}
