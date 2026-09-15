import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));
vi.mock('@/lib/rtdb', () => ({
  resolveSlug: vi.fn(),
  getListWithLinks: vi.fn(),
}));

import { generateMetadata } from '@/app/[...slug]/page';
import { getListWithLinks, resolveSlug } from '@/lib/rtdb';
import type { LinkWithId, ListWithLinks } from '@/lib/types';

const link = (id: string, overrides: Partial<LinkWithId> = {}): LinkWithId => ({
  id,
  url: `https://example.com/${id}`,
  position: 0,
  pinned: false,
  visibleFrom: null,
  visibleUntil: null,
  visibleTimezone: null,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  createdAt: 1,
  ...overrides,
});

const list = (overrides: Partial<ListWithLinks> = {}): ListWithLinks => ({
  listId: 'list-1',
  slug: 'scheduled',
  description: '',
  ownerId: 'u1',
  createdAt: 1,
  updatedAt: 2,
  links: [],
  ...overrides,
});

describe('public list page metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts only currently visible links in fallback metadata', async () => {
    vi.mocked(getListWithLinks).mockResolvedValue(list({
      links: [
        link('active'),
        link('upcoming', { visibleFrom: Date.parse('2026-01-01T12:01:00.000Z'), visibleTimezone: 'UTC' }),
        link('expired', { visibleUntil: Date.parse('2026-01-01T12:00:00.000Z'), visibleTimezone: 'UTC' }),
      ],
    }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ['scheduled'] }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.description).toBe('A curated list of 1 links');
    expect(metadata.openGraph?.description).toBe('A curated list of 1 links');
  });

  it('returns not-found metadata when the slug cannot be resolved', async () => {
    vi.mocked(resolveSlug).mockResolvedValue(null);
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: ['missing'] }),
      searchParams: Promise.resolve({}),
    });
    expect(metadata.title).toBe('List Not Found — The Urlist');
  });
});
