import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PublicListClient } from '@/app/[...slug]/client';
import type { ListWithLinks } from '@/lib/types';

vi.mock('@/components/nav-header', () => ({
  NavHeader: () => <header>nav</header>,
}));

const list: ListWithLinks = {
  listId: 'list-1',
  slug: 'sectioned',
  description: 'A sectioned list',
  ownerId: 'u1',
  createdAt: 1,
  updatedAt: 2,
  sections: [
    { id: 'a', name: 'Alpha', position: 0 },
    { id: 'b', name: 'Beta', position: 1 },
  ],
  links: [
    {
      id: 'b1',
      url: 'https://example.com/b',
      sectionId: 'b',
      position: 0,
      pinned: false,
      ogTitle: 'Beta Link',
      ogDescription: null,
      ogImage: null,
      ogSiteName: null,
      createdAt: 1,
    },
    {
      id: 'pin',
      url: 'https://example.com/pin',
      sectionId: 'b',
      position: 1,
      pinned: true,
      ogTitle: 'Pinned Link',
      ogDescription: null,
      ogImage: null,
      ogSiteName: null,
      createdAt: 1,
    },
    {
      id: 'a1',
      url: 'https://example.com/a',
      sectionId: 'a',
      position: 0,
      pinned: false,
      ogTitle: 'Alpha Link',
      ogDescription: null,
      ogImage: null,
      ogSiteName: null,
      createdAt: 1,
    },
  ],
};

describe('PublicListClient', () => {
  it('renders pinned links before ordered public sections', () => {
    const html = renderToStaticMarkup(<PublicListClient list={list} slug="sectioned" justPublished={false} />);
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
    expect(html.indexOf('Pinned Link')).toBeLessThan(html.indexOf('Alpha'));
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Alpha Link'));
    expect(html.indexOf('Alpha Link')).toBeLessThan(html.indexOf('Beta'));
    expect(html.indexOf('Beta')).toBeLessThan(html.indexOf('Beta Link'));
  });

  it('keeps legacy default-section lists visually flat', () => {
    const legacyHtml = renderToStaticMarkup(
      <PublicListClient
        list={{ ...list, sections: [{ id: 'default', name: 'Links', position: 0 }], links: [list.links[2]] }}
        slug="legacy"
        justPublished={false}
      />,
    );
    expect(legacyHtml).toContain('Alpha Link');
    expect(legacyHtml).not.toContain('<h2 id="section-default"');
    expect(legacyHtml).not.toContain('aria-labelledby="section-default"');
  });
});
