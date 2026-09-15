import type { Metadata } from 'next';
import {
  getPublicListDescription,
  getPublicListTitle,
  getResolvedSocialImageUrl,
  getSocialTitle,
} from '@/lib/list-branding';
import type { ListWithLinks } from '@/lib/types';

export function getListPageTitle(list: ListWithLinks, slug: string): string {
  const publicTitle = getPublicListTitle(slug, list.branding);
  return publicTitle === slug
    ? `${slug} — The Urlist`
    : `${publicTitle} (${slug}) — The Urlist`;
}

export function buildListPageMetadata(
  list: ListWithLinks,
  slug: string,
  origin: string,
): Metadata {
  const pageTitle = getListPageTitle(list, slug);
  const pageDescription =
    list.description ||
    `A curated list of ${list.links.length} link${list.links.length === 1 ? '' : 's'}`;
  const shareTitle = getSocialTitle(slug, list.branding);
  const shareDescription = getPublicListDescription(
    list.description,
    list.links.length,
    list.branding,
  );
  const canonicalUrl = `${origin}/${slug}`;
  const imageUrl = getResolvedSocialImageUrl(slug, list.branding, origin);

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      title: shareTitle,
      description: shareDescription,
      images: [
        {
          url: imageUrl,
          alt: `Preview image for ${getPublicListTitle(slug, list.branding)}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description: shareDescription,
      images: [imageUrl],
    },
  };
}
