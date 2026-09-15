import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('@/lib/rtdb', () => ({
  resolveSlug: vi.fn(),
  getList: vi.fn(),
  getListPasswordAccess: vi.fn(),
  getListWithLinks: vi.fn(),
}));

import { generateMetadata } from '@/app/[...slug]/page';
import { getList, getListWithLinks, resolveSlug } from '@/lib/rtdb';

const props = {
  params: Promise.resolve({ slug: ['secret-list'] }),
  searchParams: Promise.resolve({}),
};

describe('public list metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
  });

  it('does not load or expose protected list contents in metadata', async () => {
    vi.mocked(getList).mockResolvedValue({
      slug: 'secret-list',
      description: 'Hidden class handout',
      ownerId: 'u1',
      visibility: 'password-protected',
      hasPassword: true,
      createdAt: 1,
      updatedAt: 2,
    });
    const metadata = await generateMetadata(props);
    expect(metadata).toEqual(expect.objectContaining({
      title: 'Password required — The Urlist',
      description: 'This link collection is password protected.',
      robots: { index: false, follow: false },
    }));
    expect(JSON.stringify(metadata)).not.toContain('Hidden class handout');
    expect(getListWithLinks).not.toHaveBeenCalled();
  });

  it('marks unlisted metadata as noindex while keeping URL sharing metadata', async () => {
    vi.mocked(getList).mockResolvedValue({
      slug: 'secret-list',
      description: 'Shareable by URL',
      ownerId: 'u1',
      visibility: 'unlisted',
      hasPassword: false,
      createdAt: 1,
      updatedAt: 2,
    });
    vi.mocked(getListWithLinks).mockResolvedValue({
      listId: 'list-1',
      slug: 'secret-list',
      description: 'Shareable by URL',
      ownerId: 'u1',
      visibility: 'unlisted',
      hasPassword: false,
      createdAt: 1,
      updatedAt: 2,
      links: [],
    });
    const metadata = await generateMetadata(props);
    expect(metadata.description).toBe('Shareable by URL');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('keeps legacy lists public by default', async () => {
    vi.mocked(getList).mockResolvedValue({
      slug: 'secret-list',
      description: '',
      ownerId: null,
      createdAt: 1,
      updatedAt: 2,
    });
    vi.mocked(getListWithLinks).mockResolvedValue({
      listId: 'list-1',
      slug: 'secret-list',
      description: '',
      ownerId: null,
      createdAt: 1,
      updatedAt: 2,
      links: [{ id: 'a', url: 'https://example.com/', position: 0, pinned: false, ogTitle: null, ogDescription: null, ogImage: null, ogSiteName: null, createdAt: 1 }],
    });
    const metadata = await generateMetadata(props);
    expect(metadata.description).toBe('A curated list of 1 links');
    expect(metadata.robots).toBeUndefined();
  });
});
