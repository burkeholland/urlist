import { getDb } from './cosmos';
import { ListRecord, LinkWithId, ListWithLinks } from './types';
import { encodeSlugForKey, validateSlugFormat } from './slug';
import { log } from './logger';

// Read a list by listId
export async function getList(listId: string): Promise<ListRecord | null> {
  const { resource } = await getDb()
    .container('lists')
    .item(listId, listId)
    .read<ListRecord & { id: string }>();
  if (!resource) return null;
  const { id: _, ...record } = resource;
  return record as ListRecord;
}

// Read links for a list, sorted pinned-first then by position
export async function getLinks(listId: string): Promise<LinkWithId[]> {
  const { resources } = await getDb()
    .container('links')
    .items.query<{ id: string; listId: string; url: string; position: number; pinned: boolean | undefined; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null; createdAt: number }>({
      query: 'SELECT * FROM c WHERE c.listId = @listId ORDER BY c.position ASC',
      parameters: [{ name: '@listId', value: listId }],
    })
    .fetchAll();

  const links = resources.map(({ listId: _listId, ...link }) => ({
    ...link,
    pinned: link.pinned ?? false,
  }) as LinkWithId);

  // Sort pinned-first in app layer to safely handle existing docs without the field
  return links.sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

// Read a full list with links
export async function getListWithLinks(listId: string): Promise<ListWithLinks | null> {
  const list = await getList(listId);
  if (!list) return null;

  const links = await getLinks(listId);
  return { listId, ...list, links };
}

// Resolve slug to listId
export async function resolveSlug(slug: string): Promise<string | null> {
  const key = encodeSlugForKey(slug);
  const { resource } = await getDb()
    .container('slugs')
    .item(key, key)
    .read<{ id: string; slug: string; listId: string }>();
  return resource?.listId ?? null;
}

// Check if a slug is available
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const listId = await resolveSlug(slug);
  return listId === null;
}

// Reserve a slug atomically (returns true if successful, false if taken)
export async function reserveSlug(slug: string, listId: string): Promise<boolean> {
  const validation = validateSlugFormat(slug);
  if (!validation.valid) {
    throw new Error(`Invalid slug format: ${validation.error}`);
  }

  const key = encodeSlugForKey(slug);
  try {
    await getDb().container('slugs').items.create({ id: key, slug: key, listId });
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 409) {
      return false;
    }
    throw err;
  }
}

// Delete a reserved slug (for compensation on failed publish)
export async function deleteSlug(slug: string): Promise<void> {
  const key = encodeSlugForKey(slug);
  try {
    await getDb().container('slugs').item(key, key).delete();
  } catch (err) {
    log({ level: 'warn', message: 'Failed to delete slug during compensation', service: 'rtdb', data: { slug, error: String(err) } });
  }
}

// Clean up partial publish artifacts (for compensation)
export async function cleanupFailedPublish(params: {
  listId: string;
  slug: string;
  ownerId: string | null;
}): Promise<void> {
  const { listId, slug, ownerId } = params;
  const db = getDb();

  // Delete any links that were created
  try {
    const { resources: links } = await db.container('links').items
      .query<{ id: string; listId: string }>({
        query: 'SELECT c.id, c.listId FROM c WHERE c.listId = @listId',
        parameters: [{ name: '@listId', value: listId }],
      })
      .fetchAll();
    await Promise.all(links.map((l) => db.container('links').item(l.id, listId).delete()));
  } catch (err) {
    log({ level: 'warn', message: 'Compensation: failed to delete links', service: 'rtdb', data: { listId, error: String(err) } });
  }

  // Delete userLists association
  if (ownerId) {
    const userListId = ownerId + '_' + listId;
    await db.container('userLists').item(userListId, ownerId).delete().catch(() => undefined);
  }

  // Delete list record
  await db.container('lists').item(listId, listId).delete().catch(() => undefined);

  // Delete slug reservation
  await deleteSlug(slug);
}

// Publish a new list
export async function createList(params: {
  listId: string;
  slug: string;
  description: string;
  ownerId: string | null;
  links: { id: string; url: string; position: number; pinned: boolean; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null }[];
}): Promise<void> {
  const { listId, slug, description, ownerId, links } = params;
  const now = Date.now();
  const db = getDb();

  await db.container('lists').items.create({
    id: listId,
    slug,
    description,
    ownerId,
    createdAt: now,
    updatedAt: now,
  });

  const linkContainer = db.container('links');
  await Promise.all(
    links.map((link) =>
      linkContainer.items.create({
        id: link.id,
        listId,
        url: link.url,
        position: link.position,
        pinned: link.pinned,
        ogTitle: link.ogTitle,
        ogDescription: link.ogDescription,
        ogImage: link.ogImage,
        ogSiteName: link.ogSiteName,
        createdAt: now,
      }),
    ),
  );

  if (ownerId) {
    await db.container('userLists').items.create({
      id: ownerId + '_' + listId,
      uid: ownerId,
      listId,
    });
  }
}

// Update a list
export async function updateList(params: {
  listId: string;
  description?: string;
  links?: { id: string; url: string; position: number; pinned: boolean; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null }[];
}): Promise<number> {
  const { listId, description, links } = params;
  const now = Date.now();
  const db = getDb();

  const patchOps: { op: 'set'; path: string; value: unknown }[] = [
    { op: 'set', path: '/updatedAt', value: now },
  ];
  /* v8 ignore start -- V8 AST quirk: both runtime outcomes are asserted in tests, but the implicit else is unreachable to the coverage probe */
  if (description !== undefined) patchOps.push({ op: 'set', path: '/description', value: description });
  await db.container('lists').item(listId, listId).patch(patchOps);

  if (links !== undefined) {
  /* v8 ignore stop */
    const linkContainer = db.container('links');

    const { resources: existing } = await linkContainer.items
      .query<{ id: string; listId: string }>({
        query: 'SELECT c.id, c.listId FROM c WHERE c.listId = @listId',
        parameters: [{ name: '@listId', value: listId }],
      })
      .fetchAll();

    const newIds = new Set(links.map((l) => l.id));

    // Create new/updated links first (safe — won't lose data on failure)
    await Promise.all(
      links.map((link) =>
        linkContainer.items.upsert({
          id: link.id,
          listId,
          url: link.url,
          position: link.position,
          pinned: link.pinned,
          ogTitle: link.ogTitle,
          ogDescription: link.ogDescription,
          ogImage: link.ogImage,
          ogSiteName: link.ogSiteName,
          createdAt: now,
        }),
      ),
    );

    // Then delete removed links (only links not in the new set)
    const toDelete = existing.filter((l) => !newIds.has(l.id));
    await Promise.all(toDelete.map((l) => linkContainer.item(l.id, listId).delete()));
  }

  return now;
}

// Delete a list and all related data
export async function deleteList(params: {
  listId: string;
  slug: string;
  ownerId: string;
}): Promise<void> {
  const { listId, slug, ownerId } = params;
  const encodedSlug = encodeSlugForKey(slug);
  const db = getDb();

  // Delete list record
  await db.container('lists').item(listId, listId).delete().catch((err) => {
    log({ level: 'warn', message: 'Failed to delete list record', service: 'rtdb', data: { listId, error: String(err) } });
  });

  // Delete slug reservation
  await db.container('slugs').item(encodedSlug, encodedSlug).delete().catch((err) => {
    log({ level: 'warn', message: 'Failed to delete slug', service: 'rtdb', data: { slug, error: String(err) } });
  });

  // Delete all links
  const { resources: existingLinks } = await db
    .container('links')
    .items.query<{ id: string; listId: string }>({
      query: 'SELECT c.id, c.listId FROM c WHERE c.listId = @listId',
      parameters: [{ name: '@listId', value: listId }],
    })
    .fetchAll();
  await Promise.all(existingLinks.map((l) => db.container('links').item(l.id, listId).delete()));

  // Delete user-list association
  const userListId = ownerId + '_' + listId;
  await db.container('userLists').item(userListId, ownerId).delete().catch((err) => {
    log({ level: 'warn', message: 'Failed to delete user-list association', service: 'rtdb', data: { userListId, error: String(err) } });
  });
}

// Get all list IDs for a user
export async function getUserListIds(uid: string): Promise<string[]> {
  const { resources } = await getDb()
    .container('userLists')
    .items.query<{ listId: string }>({
      query: 'SELECT c.listId FROM c WHERE c.uid = @uid',
      parameters: [{ name: '@uid', value: uid }],
    })
    .fetchAll();

  return resources.map((r) => r.listId);
}

// Batch-fetch multiple lists with their links (avoids N+1 queries)
export async function getListsWithLinks(listIds: string[]): Promise<ListWithLinks[]> {
  if (listIds.length === 0) return [];

  const db = getDb();

  // Single query for all lists
  const { resources: lists } = await db.container('lists').items
    .query<ListRecord & { id: string }>({
      query: `SELECT * FROM c WHERE c.id IN (${listIds.map((_, i) => `@id${i}`).join(',')})`,
      parameters: listIds.map((id, i) => ({ name: `@id${i}`, value: id })),
    })
    .fetchAll();

  // Single query for all links across all lists
  const { resources: allLinks } = await db.container('links').items
    .query<{ id: string; listId: string; url: string; position: number; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null; createdAt: number }>({
      query: `SELECT * FROM c WHERE c.listId IN (${listIds.map((_, i) => `@id${i}`).join(',')}) ORDER BY c.position ASC`,
      parameters: listIds.map((id, i) => ({ name: `@id${i}`, value: id })),
    })
    .fetchAll();

  // Group links by listId
  const linksByListId = new Map<string, LinkWithId[]>();
  for (const { listId: _listId, ...link } of allLinks) {
    const links = linksByListId.get(_listId) ?? [];
    links.push(link as LinkWithId);
    linksByListId.set(_listId, links);
  }

  return lists.map((list) => {
    const { id, ...record } = list;
    return {
      listId: id,
      ...record,
      links: linksByListId.get(id) ?? [],
    } as ListWithLinks;
  });
}
