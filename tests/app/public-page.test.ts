import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('@/lib/rtdb', () => ({
  resolveSlug: vi.fn(),
  getListWithLinks: vi.fn(),
}));

import { generateMetadata } from '@/app/[...slug]/page';
import { getListWithLinks, resolveSlug } from '@/lib/rtdb';

describe('public page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns noindex metadata for embed mode', async () => {
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
    vi.mocked(getListWithLinks).mockResolvedValue({
      listId: 'list-1',
      slug: 'my-list',
      description: 'A nice list',
      ownerId: 'u1',
      createdAt: 1,
      updatedAt: 2,
      links: [{ id: 'link-1', url: 'https://example.com', position: 0, pinned: false, ogTitle: 'Example', ogDescription: null, ogImage: null, ogSiteName: null, createdAt: 1 }],
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ['my-list'] }),
      searchParams: Promise.resolve({ embed: '1', theme: 'dark' }),
    });

    expect(metadata.title).toBe('my-list embed — The Urlist');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toBe('/my-list');
    expect(metadata.openGraph).toBeUndefined();
  });

  it('returns open graph metadata for the standard public page', async () => {
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
    vi.mocked(getListWithLinks).mockResolvedValue({
      listId: 'list-1',
      slug: 'my-list',
      description: '',
      ownerId: 'u1',
      createdAt: 1,
      updatedAt: 2,
      links: [{ id: 'link-1', url: 'https://example.com', position: 0, pinned: false, ogTitle: 'Example', ogDescription: null, ogImage: null, ogSiteName: null, createdAt: 1 }],
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ['my-list'] }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('my-list — The Urlist');
    expect(metadata.description).toBe('A curated list of 1 links');
    expect(metadata.openGraph).toEqual({
      title: 'my-list — The Urlist',
      description: 'A curated list of 1 links',
      url: '/my-list',
    });
  });
});
