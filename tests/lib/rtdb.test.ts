import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/cosmos';
import {
  cleanupFailedPublish,
  createList,
  deleteList,
  getLinks,
  getList,
  getListWithLinks,
  getUserListIds,
  isSlugAvailable,
  reserveSlug,
  resolveSlug,
  updateList,
} from '@/lib/rtdb';

vi.mock('@/lib/cosmos', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

type Doc = Record<string, any>;

function createMockDb(seed: Record<string, Doc[]> = {}) {
  const data = new Map<string, Map<string, Doc>>();
  for (const [container, docs] of Object.entries(seed)) {
    data.set(container, new Map(docs.map((doc) => [doc.id, { ...doc }])));
  }
  const store = (name: string) => {
    if (!data.has(name)) data.set(name, new Map());
    return data.get(name)!;
  };
  const db = {
    data,
    container: vi.fn((name: string) => ({
      item: (id: string) => ({
        read: vi.fn(async () => ({ resource: store(name).get(id) })),
        delete: vi.fn(async () => {
          store(name).delete(id);
          return {};
        }),
        patch: vi.fn(async (ops: { path: string; value: unknown }[]) => {
          const doc = store(name).get(id);
          for (const op of ops) doc![op.path.slice(1)] = op.value;
          return { resource: doc };
        }),
      }),
      items: {
        create: vi.fn(async (doc: Doc) => {
          if (store(name).has(doc.id)) throw Object.assign(new Error('Conflict'), { code: 409 });
          store(name).set(doc.id, { ...doc });
          return { resource: doc };
        }),
        upsert: vi.fn(async (doc: Doc) => {
          store(name).set(doc.id, { ...doc });
          return { resource: doc };
        }),
        query: vi.fn((query: { query: string; parameters: { name: string; value: string }[] }) => ({
          fetchAll: vi.fn(async () => {
            const params = new Map(query.parameters.map((p) => [p.name, p.value]));
            let resources = [...store(name).values()];
            if (params.has('@listId')) resources = resources.filter((d) => d.listId === params.get('@listId'));
            if (params.has('@uid')) resources = resources.filter((d) => d.uid === params.get('@uid'));
            const ids = query.parameters.filter((p) => p.name.startsWith('@id')).map((p) => p.value);
            if (ids.length && name === 'lists') resources = resources.filter((d) => ids.includes(d.id));
            if (ids.length && name === 'links') resources = resources.filter((d) => ids.includes(d.listId));
            if (query.query.includes('ORDER BY c.position')) resources.sort((a, b) => a.position - b.position);
            return { resources: resources.map((d) => ({ ...d })) };
          }),
        })),
      },
    })),
  };
  return db;
}

const fullLink = (id: string, position: number, pinned = false) => ({
  id,
  listId: 'list-1',
  url: `https://example.com/${id}`,
  position,
  pinned,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  createdAt: 1,
});

describe('rtdb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolveSlug returns listId when slug exists and null when not', async () => {
    const db = createMockDb({ slugs: [{ id: 'a~b', slug: 'a~b', listId: 'list-1' }] });
    vi.mocked(getDb).mockReturnValue(db as any);
    await expect(resolveSlug('a/b')).resolves.toBe('list-1');
    await expect(resolveSlug('missing')).resolves.toBeNull();
  });

  it('isSlugAvailable returns true only when slug is not found', async () => {
    const db = createMockDb({ slugs: [{ id: 'taken', slug: 'taken', listId: 'list-1' }] });
    vi.mocked(getDb).mockReturnValue(db as any);
    await expect(isSlugAvailable('free')).resolves.toBe(true);
    await expect(isSlugAvailable('taken')).resolves.toBe(false);
  });

  it('reserveSlug creates a slug doc and returns false on conflict', async () => {
    const db = createMockDb({ slugs: [{ id: 'taken', slug: 'taken', listId: 'old' }] });
    vi.mocked(getDb).mockReturnValue(db as any);
    await expect(reserveSlug('new', 'list-1')).resolves.toBe(true);
    expect(db.data.get('slugs')!.get('new')!.listId).toBe('list-1');
    await expect(reserveSlug('taken', 'list-2')).resolves.toBe(false);
  });

  it('getList returns a list without Cosmos id or null', async () => {
    const db = createMockDb({ lists: [{ id: 'list-1', slug: 's', description: '', ownerId: null, createdAt: 1, updatedAt: 2 }] });
    vi.mocked(getDb).mockReturnValue(db as any);
    expect(await getList('list-1')).toEqual({ slug: 's', description: '', ownerId: null, createdAt: 1, updatedAt: 2 });
    await expect(getList('missing')).resolves.toBeNull();
  });

  it('getLinks returns links sorted by pinned then position', async () => {
    const db = createMockDb({ links: [fullLink('a', 0), fullLink('b', 1, true), fullLink('c', 2)] });
    vi.mocked(getDb).mockReturnValue(db as any);
    expect((await getLinks('list-1')).map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });

  it('getListWithLinks combines list and links', async () => {
    const db = createMockDb({
      lists: [{ id: 'list-1', slug: 's', description: '', ownerId: 'u1', createdAt: 1, updatedAt: 2 }],
      links: [fullLink('a', 0)],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListWithLinks('list-1');
    expect(result?.listId).toBe('list-1');
    expect(result?.links).toHaveLength(1);
  });

  it('createList creates list, links, and userList records', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const db = createMockDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await createList({ listId: 'list-1', slug: 's', description: 'd', ownerId: 'u1', links: [fullLink('a', 0)] });
    expect(db.data.get('lists')!.get('list-1')!.updatedAt).toBe(100);
    expect(db.data.get('links')!.get('a')!.listId).toBe('list-1');
    expect(db.data.get('userLists')!.get('u1_list-1')!.uid).toBe('u1');
  });

  it('updateList patches list, upserts current links, and deletes removed links', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(200);
    const db = createMockDb({
      lists: [{ id: 'list-1', slug: 's', description: 'old', ownerId: 'u1', createdAt: 1, updatedAt: 2 }],
      links: [fullLink('keep', 0), fullLink('remove', 1)],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    await expect(updateList({ listId: 'list-1', description: 'new', links: [fullLink('keep', 2), fullLink('add', 3)] })).resolves.toBe(200);
    expect(db.data.get('lists')!.get('list-1')!.description).toBe('new');
    expect(db.data.get('links')!.has('remove')).toBe(false);
    expect(db.data.get('links')!.has('add')).toBe(true);
  });

  it('deleteList deletes list, slug, links, and userList records', async () => {
    const db = createMockDb({
      lists: [{ id: 'list-1' }],
      slugs: [{ id: 'my~slug', slug: 'my~slug', listId: 'list-1' }],
      links: [fullLink('a', 0)],
      userLists: [{ id: 'u1_list-1', uid: 'u1', listId: 'list-1' }],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    await deleteList({ listId: 'list-1', slug: 'my/slug', ownerId: 'u1' });
    expect(db.data.get('lists')!.has('list-1')).toBe(false);
    expect(db.data.get('slugs')!.has('my~slug')).toBe(false);
    expect(db.data.get('links')!.has('a')).toBe(false);
    expect(db.data.get('userLists')!.has('u1_list-1')).toBe(false);
  });

  it('getUserListIds returns list IDs for a user', async () => {
    const db = createMockDb({ userLists: [{ id: 'u1_a', uid: 'u1', listId: 'a' }, { id: 'u2_b', uid: 'u2', listId: 'b' }] });
    vi.mocked(getDb).mockReturnValue(db as any);
    await expect(getUserListIds('u1')).resolves.toEqual(['a']);
  });

  it('cleanupFailedPublish cleans up all artifacts', async () => {
    const db = createMockDb({
      lists: [{ id: 'list-1' }],
      slugs: [{ id: 'slug', slug: 'slug', listId: 'list-1' }],
      links: [fullLink('a', 0)],
      userLists: [{ id: 'u1_list-1', uid: 'u1', listId: 'list-1' }],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    await cleanupFailedPublish({ listId: 'list-1', slug: 'slug', ownerId: 'u1' });
    expect(db.data.get('lists')!.size).toBe(0);
    expect(db.data.get('slugs')!.size).toBe(0);
    expect(db.data.get('links')!.size).toBe(0);
    expect(db.data.get('userLists')!.size).toBe(0);
  });
});
