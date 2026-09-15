import { describe, expect, it } from 'vitest';
import { buildListPageMetadata, getListPageTitle } from '@/lib/list-metadata';
import type { ListWithLinks } from '@/lib/types';

const baseList: ListWithLinks = {
  listId: 'list-1',
  slug: 'my-list',
  description: '',
  branding: {
    publicTitle: null,
    socialTitle: null,
    socialDescription: null,
    coverImage: null,
    socialImage: null,
    appearance: { theme: 'default', accent: 'coral', layout: 'comfortable' },
  },
  ownerId: 'u1',
  createdAt: 1,
  updatedAt: 2,
  links: [{ id: 'link-1', url: 'https://example.com/', position: 0, pinned: false, ogTitle: null, ogDescription: null, ogImage: null, ogSiteName: null, createdAt: 1 }],
};

describe('list metadata', () => {
  it('builds default metadata with a generated fallback image', () => {
    const metadata = buildListPageMetadata(baseList, 'my-list', 'https://urlist.test');
    expect(getListPageTitle(baseList, 'my-list')).toBe('my-list — The Urlist');
    expect(metadata.description).toBe('A curated list of 1 link');
    expect(metadata.alternates?.canonical).toBe('https://urlist.test/my-list');
    expect(metadata.openGraph).toEqual(expect.objectContaining({
      title: 'my-list',
      description: 'A curated list of 1 link',
      url: 'https://urlist.test/my-list',
      images: [expect.objectContaining({ url: 'https://urlist.test/my-list/opengraph-image' })],
    }));
    expect(metadata.twitter).toEqual(expect.objectContaining({
      card: 'summary_large_image',
      images: ['https://urlist.test/my-list/opengraph-image'],
    }));
  });

  it('prefers custom public and social metadata when provided', () => {
    const metadata = buildListPageMetadata({
      ...baseList,
      description: 'Hand-picked developer tools.',
      branding: {
        ...baseList.branding,
        publicTitle: 'Dev toolkit',
        socialTitle: 'Ship faster with this toolkit',
        socialDescription: 'Curated links for product engineers and founders.',
        socialImage: {
          url: 'https://cdn.example.com/social.png',
          contentType: 'image/png',
          width: 1200,
          height: 630,
          sizeBytes: 1024,
        },
      },
    }, 'my-list', 'https://urlist.test');

    expect(getListPageTitle({
      ...baseList,
      branding: {
        ...baseList.branding,
        publicTitle: 'Dev toolkit',
      },
    }, 'my-list')).toBe('Dev toolkit (my-list) — The Urlist');
    expect(metadata.description).toBe('Hand-picked developer tools.');
    expect(metadata.openGraph).toEqual(expect.objectContaining({
      title: 'Ship faster with this toolkit',
      description: 'Curated links for product engineers and founders.',
      images: [expect.objectContaining({ url: 'https://cdn.example.com/social.png' })],
    }));
    expect(metadata.twitter).toEqual(expect.objectContaining({
      title: 'Ship faster with this toolkit',
      description: 'Curated links for product engineers and founders.',
      images: ['https://cdn.example.com/social.png'],
    }));
  });
});
