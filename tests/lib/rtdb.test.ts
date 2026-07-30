import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/cosmos';
import {
  cleanupFailedPublish,
  createList,
  deleteList,
  deleteSlug,
  getLinks,
  getList,
  getListsWithLinks,
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

  it('getLinks queries the links container filtered by listId and ordered by position', async () => {
    const db = createMockDb({ links: [fullLink('a', 0)] });
    vi.mocked(getDb).mockReturnValue(db as any);
    await getLinks('list-1');
    const linksQuery = db.container.mock.results
      .map((r: any) => r.value.items.query.mock.calls)
      .flat()
      .find((c: any) => c?.[0]?.query?.includes('ORDER BY'));
    expect(linksQuery[0].query).toBe('SELECT * FROM c WHERE c.listId = @listId ORDER BY c.position ASC');
    expect(linksQuery[0].parameters).toEqual([{ name: '@listId', value: 'list-1' }]);
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

  it('reserveSlug returns false for 409 conflicts only and rethrows other error shapes', async () => {
    const cases: Array<[unknown, boolean]> = [
      [Object.assign(new Error('conflict'), { code: 409 }), false],
      [new Error('plain'), true], // no code property — rethrown
      ['string error', true], // not an object — rethrown
      [null, true], // null — rethrown
      [Object.assign(new Error('other'), { code: 500 }), true], // non-409 — rethrown
    ];
    for (const [err, shouldThrow] of cases) {
      const db = createMockDb();
      const failing = {
        ...db,
        container: vi.fn((name: string) => {
          const c = db.container(name);
          c.items.create = vi.fn(async () => { throw err; });
          return c;
        }),
      };
      vi.mocked(getDb).mockReturnValue(failing as any);
      if (shouldThrow) {
        await expect(reserveSlug('slug-x', 'list-1')).rejects.toBe(err);
      } else {
        await expect(reserveSlug('slug-x', 'list-1')).resolves.toBe(false);
      }
    }
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

  it('defaults pinned to false for links created before the pinned field existed', async () => {
    const db = createMockDb({ links: [{ ...fullLink('a', 0), pinned: undefined }] });
    vi.mocked(getDb).mockReturnValue(db as any);
    const links = await getLinks('list-1');
    expect(links[0].pinned).toBe(false);
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

  it('updateList always patches updatedAt and only patches description when provided', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(300);
    const db = createMockDb({
      lists: [{ id: 'list-1', slug: 's', description: 'old', ownerId: 'u1', createdAt: 1, updatedAt: 2 }],
    });
    const patches: any[] = [];
    const spying = {
      ...db,
      container: vi.fn((name: string) => {
        const c = db.container(name);
        return {
          ...c,
          item: (id: string) => ({
            ...c.item(id),
            patch: vi.fn(async (ops: any[]) => { patches.push(...ops); return {}; }),
          }),
        };
      }),
    };
    vi.mocked(getDb).mockReturnValue(spying as any);
    await updateList({ listId: 'list-1' });
    expect(patches).toEqual([{ op: 'set', path: '/updatedAt', value: 300 }]);
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
    const query = db.container.mock.results
      .map((r: any) => r.value.items.query.mock.calls)
      .flat()
      .map((c: any) => c?.[0])[0];
    expect(query.query).toBe('SELECT c.listId FROM c WHERE c.uid = @uid');
    expect(query.parameters).toEqual([{ name: '@uid', value: 'u1' }]);
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

  it('getListWithLinks returns null when the list does not exist', async () => {
    const db = createMockDb({ links: [fullLink('a', 0)] });
    vi.mocked(getDb).mockReturnValue(db as any);
    await expect(getListWithLinks('missing')).resolves.toBeNull();
  });

  it('reserveSlug throws for invalid slug format', async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await expect(reserveSlug('Bad Slug', 'list-1')).rejects.toThrow('Invalid slug format');
  });

  it('reserveSlug rethrows non-conflict errors', async () => {
    const db = createMockDb();
    const failing = {
      ...db,
      container: vi.fn((name: string) => {
        const c = db.container(name);
        c.items.create = vi.fn(async () => { throw Object.assign(new Error('network'), { code: 500 }); });
        return c;
      }),
    };
    vi.mocked(getDb).mockReturnValue(failing as any);
    await expect(reserveSlug('good', 'list-1')).rejects.toThrow('network');
  });

  it('deleteSlug logs a warning when deletion fails', async () => {
    const { log } = await import('@/lib/logger');
    const db = createMockDb({ slugs: [{ id: 's', slug: 's', listId: 'l' }] });
    const failing = {
      ...db,
      container: vi.fn((name: string) => {
        const c = db.container(name);
        return {
          ...c,
          item: (id: string) => ({
            delete: vi.fn(async () => { throw new Error('gone'); }),
          }),
        };
      }),
    };
    vi.mocked(getDb).mockReturnValue(failing as any);
    await expect(deleteSlug('s')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: 'Failed to delete slug during compensation' }));
  });

  it('cleanupFailedPublish logs when link query fails and skips userLists for anonymous owners', async () => {
    const { log } = await import('@/lib/logger');
    const db = createMockDb({ lists: [{ id: 'list-1' }] });
    const failing = {
      ...db,
      container: vi.fn((name: string) => {
        const c = db.container(name);
        if (name === 'links') {
          c.items.query = vi.fn(() => ({ fetchAll: vi.fn(async () => { throw new Error('query down'); }) }));
        }
        return c;
      }),
    };
    vi.mocked(getDb).mockReturnValue(failing as any);
    await expect(cleanupFailedPublish({ listId: 'list-1', slug: 's', ownerId: null })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: 'Compensation: failed to delete links' }));
    expect(db.data.get('lists')!.size).toBe(0);
  });

  it('createList skips userList creation for anonymous owners', async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await createList({ listId: 'list-1', slug: 's', description: 'd', ownerId: null, links: [] });
    expect(db.data.has('userLists')).toBe(false);
    expect(db.data.get('lists')!.get('list-1')!.ownerId).toBeNull();
  });

  it('deleteList tolerates failures and logs warnings', async () => {
    const { log } = await import('@/lib/logger');
    const db = createMockDb({
      lists: [{ id: 'list-1' }],
      links: [fullLink('a', 0)],
    });
    const failingDeletes = new Set(['lists', 'slugs', 'userLists']);
    const flaky = {
      ...db,
      container: vi.fn((name: string) => {
        const c = db.container(name);
        if (failingDeletes.has(name)) {
          return {
            ...c,
            item: (id: string) => ({
              delete: vi.fn(async () => { throw new Error(`${name} delete failed`); }),
            }),
          };
        }
        return c;
      }),
    };
    vi.mocked(getDb).mockReturnValue(flaky as any);
    await expect(deleteList({ listId: 'list-1', slug: 's', ownerId: 'u1' })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to delete list record' }));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to delete slug' }));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to delete user-list association' }));
    expect(db.data.get('links')!.size).toBe(0);
  });

  it('getListsWithLinks returns empty array for empty input', async () => {
    await expect(getListsWithLinks([])).resolves.toEqual([]);
  });

  it('cleanupFailedPublish tolerates userLists and lists delete failures', async () => {
    const db = createMockDb({
      lists: [{ id: 'list-1' }],
      slugs: [{ id: 's', slug: 's', listId: 'list-1' }],
      userLists: [{ id: 'u1_list-1', uid: 'u1', listId: 'list-1' }],
    });
    const flaky = {
      ...db,
      container: vi.fn((name: string) => {
        const c = db.container(name);
        if (name === 'userLists' || name === 'lists') {
          return {
            ...c,
            item: (id: string) => ({
              delete: vi.fn(async () => { throw new Error(`${name} down`); }),
            }),
          };
        }
        return c;
      }),
    };
    vi.mocked(getDb).mockReturnValue(flaky as any);
    await expect(cleanupFailedPublish({ listId: 'list-1', slug: 's', ownerId: 'u1' })).resolves.toBeUndefined();
  });

  it('getListsWithLinks batches lists and groups links by list', async () => {
    const db = createMockDb({
      lists: [
        { id: 'l1', slug: 'a', description: 'da', ownerId: 'u1', createdAt: 1, updatedAt: 2 },
        { id: 'l2', slug: 'b', description: 'db', ownerId: 'u1', createdAt: 1, updatedAt: 2 },
        { id: 'l3', slug: 'c', description: 'dc', ownerId: 'u1', createdAt: 1, updatedAt: 2 },
      ],
      links: [
        { ...fullLink('x', 1), listId: 'l1' },
        { ...fullLink('y', 0), listId: 'l1' },
        { ...fullLink('z', 0), listId: 'l2' },
        { ...fullLink('other', 0), listId: 'l9' },
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListsWithLinks(['l1', 'l2', 'l3']);
    expect(result.map((l) => l.listId)).toEqual(['l1', 'l2', 'l3']);
    expect(result[0].links.map((l) => l.id)).toEqual(['y', 'x']);
    expect(result[1].links.map((l) => l.id)).toEqual(['z']);
    expect(result[2].links).toEqual([]);
    // Verify batched IN-queries with per-id parameters
    const queries = db.container.mock.results
      .map((r: any) => r.value.items.query.mock.calls)
      .flat()
      .map((c: any) => c?.[0]);
    expect(queries[0].query).toBe('SELECT * FROM c WHERE c.id IN (@id0,@id1,@id2)');
    expect(queries[0].parameters).toEqual([
      { name: '@id0', value: 'l1' },
      { name: '@id1', value: 'l2' },
      { name: '@id2', value: 'l3' },
    ]);
    expect(queries[1].query).toBe('SELECT * FROM c WHERE c.listId IN (@id0,@id1,@id2) ORDER BY c.position ASC');
    expect(queries[1].parameters).toEqual([
      { name: '@id0', value: 'l1' },
      { name: '@id1', value: 'l2' },
      { name: '@id2', value: 'l3' },
    ]);
  });
});
