import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { cookies } from 'next/headers';
import { cookieStoreHasListAccess, listRequiresPassword } from '@/lib/list-access';
import { getList, getListPasswordAccess, getListWithLinks, resolveSlug } from '@/lib/rtdb';
import { PublicListClient } from './client';
import { ProtectedListUnlock } from './unlock-client';

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

  const list = await getList(listId);
  if (!list) {
    return { title: 'List Not Found — The Urlist' };
  }

  if (list.visibility === 'password-protected') {
    return {
      title: 'Password required — The Urlist',
      description: 'This link collection is password protected.',
      robots: { index: false, follow: false },
      openGraph: {
        title: 'Password required — The Urlist',
        description: 'This link collection is password protected.',
        url: `/${slug}`,
      },
    };
  }

  const listWithLinks = await getListWithLinks(listId);
  if (!listWithLinks) {
    return { title: 'List Not Found — The Urlist' };
  }

  const robots = list.visibility === 'unlisted'
    ? { index: false, follow: false }
    : undefined;

  return {
    title: `${slug} — The Urlist`,
    description: list.description || `A curated list of ${listWithLinks.links.length} links`,
    robots,
    openGraph: {
      title: `${slug} — The Urlist`,
      description: list.description || `A curated list of ${listWithLinks.links.length} links`,
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

  const list = await getList(listId);
  const passwordAccess = list ? await getListPasswordAccess(listId) : null;
  if (!list || !passwordAccess) {
    notFound();
  }

  if (listRequiresPassword(list)) {
    const cookieStore = await cookies();
    const hasAccess = await cookieStoreHasListAccess(
      cookieStore,
      listId,
      list,
      passwordAccess.passwordUpdatedAt,
    );
    if (!hasAccess) {
      return <ProtectedListUnlock slug={slug} />;
    }
  }

  const listWithLinks = await getListWithLinks(listId);
  if (!listWithLinks) {
    notFound();
  }

  return <PublicListClient list={listWithLinks} slug={slug} justPublished={justPublished} />;
}
