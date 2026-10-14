import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/rtdb', () => ({
  resolveSlug: vi.fn(),
  getListAccessRecord: vi.fn(),
  getLinks: vi.fn(),
}));

import { cookies } from 'next/headers';
import PublicListPage, { generateMetadata } from '@/app/[...slug]/page';
import { PublicListClient } from '@/app/[...slug]/client';
import { ProtectedListUnlock } from '@/app/[...slug]/unlock-client';
import { _resetSecretCache, createListAccessToken, createSessionToken } from '@/lib/auth';
import { getLinks, getListAccessRecord, resolveSlug } from '@/lib/rtdb';
import type { ListRecord } from '@/lib/types';

const link = { id: 'a', url: 'https://example.com/', position: 0, pinned: false, ogTitle: 'Hidden link title', ogDescription: null, ogImage: null, ogSiteName: null, createdAt: 1 };

const props = (slug = ['secret-list'], search: Record<string, string> = {}) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(search),
});

function record(list: Partial<ListRecord>, passwordUpdatedAt = 100) {
  return {
    list: { slug: 'secret-list', description: 'Hidden class handout', ownerId: 'owner-1', createdAt: 1, updatedAt: 2, ...list },
    passwordHash: list.visibility === 'password-protected' ? 'stored-hash' : null,
    passwordUpdatedAt,
  };
}

function useCookies(values: Record<string, string> = {}) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name in values ? { name, value: values[name] } : undefined),
  } as never);
}

describe('public list metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
    vi.mocked(getLinks).mockResolvedValue([link]);
  });

  it('does not load or expose protected list contents in metadata', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ visibility: 'password-protected', hasPassword: true }));
    const metadata = await generateMetadata(props());
    expect(metadata).toEqual({
      title: 'Password required — The Urlist',
      description: 'This link collection is password protected.',
      robots: { index: false, follow: false },
      openGraph: {
        title: 'Password required — The Urlist',
        description: 'This link collection is password protected.',
        url: '/secret-list',
      },
    });
    expect(JSON.stringify(metadata)).not.toContain('Hidden');
    expect(getLinks).not.toHaveBeenCalled();
  });

  it('marks unlisted metadata as noindex while keeping URL sharing metadata', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ description: 'Shareable by URL', visibility: 'unlisted', hasPassword: false }));
    const metadata = await generateMetadata(props());
    expect(metadata.description).toBe('Shareable by URL');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('keeps legacy lists public by default', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ description: '', ownerId: null }));
    const metadata = await generateMetadata(props());
    expect(metadata.description).toBe('A curated list of 1 links');
    expect(metadata.robots).toBeUndefined();
  });

  it('returns not-found metadata for unknown slugs and deleted lists', async () => {
    vi.mocked(resolveSlug).mockResolvedValueOnce(null);
    expect((await generateMetadata(props())).title).toBe('List Not Found — The Urlist');
    vi.mocked(getListAccessRecord).mockResolvedValueOnce(null);
    expect((await generateMetadata(props())).title).toBe('List Not Found — The Urlist');
  });
});

describe('public list page access', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = 'test-secret-for-vitest-minimum-32-chars';
    _resetSecretCache();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSlug).mockResolvedValue('list-1');
    vi.mocked(getLinks).mockResolvedValue([link]);
    useCookies();
  });

  it('404s for unknown slugs', async () => {
    vi.mocked(resolveSlug).mockResolvedValue(null);
    await expect(PublicListPage(props())).rejects.toThrow();
  });

  it('shows a locked visitor only the unlock form with the slug, never list details or links', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ visibility: 'password-protected', hasPassword: true }));
    const element = await PublicListPage(props());
    expect(element.type).toBe(ProtectedListUnlock);
    expect(element.props).toEqual({ slug: 'secret-list' });
    expect(getLinks).not.toHaveBeenCalled();
  });

  it('gives the unlock form the canonical slug when the page is reached through a slug alias', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ slug: 'team/handout', visibility: 'password-protected', hasPassword: true }));
    const element = await PublicListPage(props(['team~handout']));
    expect(element.props).toEqual({ slug: 'team/handout' });
  });

  it('keeps the list locked for a stale unlock cookie or another signed-in user', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ visibility: 'password-protected', hasPassword: true }));
    useCookies({
      session: await createSessionToken({ uid: 'someone-else', username: 'someone', name: '', avatar: '' }),
      'list_access_list-1': await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 99 }),
    });
    expect((await PublicListPage(props())).type).toBe(ProtectedListUnlock);
  });

  it('renders the list for a visitor with a current unlock cookie', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ visibility: 'password-protected', hasPassword: true }));
    useCookies({ 'list_access_list-1': await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 100 }) });
    const element = await PublicListPage(props());
    expect(element.type).toBe(PublicListClient);
    expect(element.props.list.links).toEqual([link]);
  });

  it('renders the list for the signed-in owner without an unlock cookie', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ visibility: 'password-protected', hasPassword: true }));
    useCookies({ session: await createSessionToken({ uid: 'owner-1', username: 'owner', name: '', avatar: '' }) });
    const element = await PublicListPage(props(['secret-list'], { published: 'true' }));
    expect(element.type).toBe(PublicListClient);
    expect(element.props).toEqual(expect.objectContaining({ slug: 'secret-list', justPublished: true }));
    expect(JSON.stringify(element.props)).not.toContain('stored-hash');
  });

  it('renders unlisted lists without reading cookies', async () => {
    vi.mocked(getListAccessRecord).mockResolvedValue(record({ visibility: 'unlisted', hasPassword: false }));
    const element = await PublicListPage(props());
    expect(element.type).toBe(PublicListClient);
    expect(element.props.list).toEqual(expect.objectContaining({ listId: 'list-1', visibility: 'unlisted', links: [link] }));
    expect(cookies).not.toHaveBeenCalled();
  });
});
