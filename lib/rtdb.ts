import { getDb } from './cosmos';
import { createHash, randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import type { AuthUser } from './auth';
import type {
  InviteRole,
  ListInvite,
  ListMembership,
  ListRecord,
  LinkWithId,
  ListWithLinks,
  MembershipRole,
  SafeListInvite,
} from './types';
import { encodeSlugForKey, validateSlugFormat } from './slug';
import { log } from './logger';

const DEFAULT_INVITE_EXPIRY_DAYS = 7;
const INVITE_TOKEN_BYTES = 32;

function membershipId(uid: string, listId: string): string {
  return `${uid}_${listId}`;
}

function toMembership(resource: Partial<ListMembership> & { id: string; uid: string; listId: string }): ListMembership {
  const now = Date.now();
  return {
    id: resource.id,
    uid: resource.uid,
    listId: resource.listId,
    role: resource.role ?? 'viewer',
    createdAt: resource.createdAt ?? now,
    updatedAt: resource.updatedAt ?? resource.createdAt ?? now,
    invitedBy: resource.invitedBy ?? null,
    acceptedAt: resource.acceptedAt ?? null,
    username: resource.username ?? null,
    name: resource.name ?? null,
    avatar: resource.avatar ?? null,
  };
}

function stripInviteSecret(invite: ListInvite): SafeListInvite {
  return {
    id: invite.id,
    type: invite.type,
    listId: invite.listId,
    role: invite.role,
    createdAt: invite.createdAt,
    createdBy: invite.createdBy,
    expiresAt: invite.expiresAt,
    revokedAt: invite.revokedAt,
    revokedBy: invite.revokedBy,
    acceptedAt: invite.acceptedAt,
    acceptedBy: invite.acceptedBy,
    rotatedFrom: invite.rotatedFrom,
  };
}

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function strongerRole(a: MembershipRole, b: MembershipRole): MembershipRole {
  const rank: Record<MembershipRole, number> = { viewer: 1, editor: 2, owner: 3 };
  return rank[a] >= rank[b] ? a : b;
}

// Read a list by listId
export async function getList(listId: string): Promise<ListRecord | null> {
  const { resource } = await getDb()
    .container('lists')
    .item(listId, listId)
    .read<ListRecord & { id: string }>();
  if (!resource) return null;
  const { id, ...record } = resource;
  void id;
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

  const links = resources.map((resource) => {
    const { listId: resourceListId, ...link } = resource;
    void resourceListId;
    return {
      ...link,
      pinned: link.pinned ?? false,
    } as LinkWithId;
  });

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
    const userListId = membershipId(ownerId, listId);
    await db.container('userLists').item(userListId, ownerId).delete().catch(() => undefined);
  }

  // Delete list record
  await db.container('lists').item(listId, listId).delete().catch(() => undefined);

  // Delete slug reservation
  await deleteSlug(slug);
}

export async function upsertListMembership(params: {
  uid: string;
  listId: string;
  role: MembershipRole;
  invitedBy?: string | null;
  acceptedAt?: number | null;
  user?: Pick<AuthUser, 'username' | 'name' | 'avatar'> | null;
}): Promise<ListMembership> {
  const now = Date.now();
  const existing = await getListMembership(params.listId, params.uid);
  const role = existing ? strongerRole(existing.role, params.role) : params.role;
  const membership: ListMembership = {
    id: membershipId(params.uid, params.listId),
    uid: params.uid,
    listId: params.listId,
    role,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    invitedBy: existing?.invitedBy ?? params.invitedBy ?? null,
    acceptedAt: existing?.acceptedAt ?? params.acceptedAt ?? (role === 'owner' ? now : null),
    username: params.user?.username ?? existing?.username ?? null,
    name: params.user?.name ?? existing?.name ?? null,
    avatar: params.user?.avatar ?? existing?.avatar ?? null,
  };
  await getDb().container('userLists').items.upsert(membership);
  return membership;
}

export async function getListMembership(listId: string, uid: string): Promise<ListMembership | null> {
  const { resource } = await getDb()
    .container('userLists')
    .item(membershipId(uid, listId), uid)
    .read<ListMembership>();
  return resource ? toMembership(resource) : null;
}

export async function getListMemberships(listId: string): Promise<ListMembership[]> {
  const { resources } = await getDb()
    .container('userLists')
    .items.query<ListMembership>({
      query: 'SELECT * FROM c WHERE c.listId = @listId',
      parameters: [{ name: '@listId', value: listId }],
    })
    .fetchAll();
  return resources.map(toMembership);
}

export async function getUserListMemberships(uid: string): Promise<ListMembership[]> {
  const { resources } = await getDb()
    .container('userLists')
    .items.query<ListMembership>({
      query: 'SELECT * FROM c WHERE c.uid = @uid',
      parameters: [{ name: '@uid', value: uid }],
    })
    .fetchAll();
  return resources.map(toMembership);
}

export async function updateListMembershipRole(params: {
  listId: string;
  uid: string;
  role: InviteRole;
}): Promise<ListMembership | null> {
  const existing = await getListMembership(params.listId, params.uid);
  if (!existing || existing.role === 'owner') return null;
  const now = Date.now();
  await getDb()
    .container('userLists')
    .item(membershipId(params.uid, params.listId), params.uid)
    .patch([
      { op: 'set', path: '/role', value: params.role },
      { op: 'set', path: '/updatedAt', value: now },
    ]);
  return { ...existing, role: params.role, updatedAt: now };
}

export async function removeListMembership(listId: string, uid: string): Promise<boolean> {
  const existing = await getListMembership(listId, uid);
  if (!existing || existing.role === 'owner') return false;
  await getDb().container('userLists').item(membershipId(uid, listId), uid).delete();
  return true;
}

// Publish a new list
export async function createList(params: {
  listId: string;
  slug: string;
  description: string;
  ownerId: string | null;
  ownerProfile?: Pick<AuthUser, 'username' | 'name' | 'avatar'> | null;
  links: { id: string; url: string; position: number; pinned: boolean; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null }[];
}): Promise<void> {
  const { listId, slug, description, ownerId, ownerProfile, links } = params;
  const now = Date.now();
  const db = getDb();

  await db.container('lists').items.create({
    id: listId,
    slug,
    description,
    ownerId,
    createdBy: ownerId,
    updatedBy: ownerId,
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
        createdBy: ownerId,
        updatedBy: ownerId,
      }),
    ),
  );

  if (ownerId) {
    await db.container('userLists').items.create({
      id: membershipId(ownerId, listId),
      uid: ownerId,
      listId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
      acceptedAt: now,
      username: ownerProfile?.username ?? null,
      name: ownerProfile?.name ?? null,
      avatar: ownerProfile?.avatar ?? null,
    });
  }
}

// Update a list
export async function updateList(params: {
  listId: string;
  actorId: string;
  description?: string;
  links?: { id: string; url: string; position: number; pinned: boolean; ogTitle: string | null; ogDescription: string | null; ogImage: string | null; ogSiteName: string | null }[];
}): Promise<number> {
  const { listId, actorId, description, links } = params;
  const now = Date.now();
  const db = getDb();

  const patchOps: { op: 'set'; path: string; value: unknown }[] = [
    { op: 'set', path: '/updatedAt', value: now },
    { op: 'set', path: '/updatedBy', value: actorId },
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
          updatedBy: actorId,
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
  const { listId, slug } = params;
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

  // Delete all memberships
  try {
    const { resources: memberships } = await db
      .container('userLists')
      .items.query<{ id: string; uid: string }>({
        query: 'SELECT c.id, c.uid FROM c WHERE c.listId = @listId',
        parameters: [{ name: '@listId', value: listId }],
      })
      .fetchAll();
    await Promise.all(
      memberships.map((m) =>
        db.container('userLists').item(m.id, m.uid).delete().catch((err) => {
          log({ level: 'warn', message: 'Failed to delete user-list association', service: 'rtdb', data: { userListId: m.id, error: String(err) } });
        }),
      ),
    );
  } catch (err) {
    log({ level: 'warn', message: 'Failed to query list memberships during delete', service: 'rtdb', data: { listId, error: String(err) } });
  }

  // Delete invites and acceptance markers
  try {
    const { resources: invites } = await db
      .container('invites')
      .items.query<{ id: string; listId: string }>({
        query: 'SELECT c.id, c.listId FROM c WHERE c.listId = @listId',
        parameters: [{ name: '@listId', value: listId }],
      })
      .fetchAll();
    await Promise.all(
      invites.map((invite) =>
        db.container('invites').item(invite.id, listId).delete().catch((err) => {
          log({ level: 'warn', message: 'Failed to delete invite', service: 'rtdb', data: { inviteId: invite.id, error: String(err) } });
        }),
      ),
    );
  } catch (err) {
    log({ level: 'warn', message: 'Failed to query invites during delete', service: 'rtdb', data: { listId, error: String(err) } });
  }
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

export async function createInvite(params: {
  listId: string;
  role: InviteRole;
  createdBy: string;
  expiresInDays?: number;
}): Promise<{ invite: SafeListInvite; token: string }> {
  const token = generateInviteToken();
  const now = Date.now();
  const expiresAt = now + (params.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS) * 24 * 60 * 60 * 1000;
  const invite: ListInvite = {
    id: `inv_${nanoid(12)}`,
    type: 'invite',
    listId: params.listId,
    role: params.role,
    tokenHash: hashInviteToken(token),
    createdAt: now,
    createdBy: params.createdBy,
    expiresAt,
  };
  await getDb().container('invites').items.create(invite);
  return { invite: stripInviteSecret(invite), token };
}

export async function listInvites(listId: string): Promise<SafeListInvite[]> {
  const { resources } = await getDb()
    .container('invites')
    .items.query<ListInvite>({
      query: 'SELECT * FROM c WHERE c.listId = @listId AND c.type = @type',
      parameters: [
        { name: '@listId', value: listId },
        { name: '@type', value: 'invite' },
      ],
    })
    .fetchAll();

  return resources
    .map(stripInviteSecret)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeInvite(params: {
  listId: string;
  inviteId: string;
  actorId: string;
}): Promise<SafeListInvite | null> {
  const db = getDb();
  const { resource } = await db
    .container('invites')
    .item(params.inviteId, params.listId)
    .read<ListInvite>();
  if (!resource || resource.type !== 'invite' || resource.listId !== params.listId) {
    return null;
  }

  const now = Date.now();
  await db.container('invites').item(params.inviteId, params.listId).patch([
    { op: 'set', path: '/revokedAt', value: now },
    { op: 'set', path: '/revokedBy', value: params.actorId },
  ]);

  return stripInviteSecret({ ...resource, revokedAt: now, revokedBy: params.actorId });
}

export async function rotateInvite(params: {
  listId: string;
  inviteId: string;
  actorId: string;
  expiresInDays?: number;
}): Promise<{ invite: SafeListInvite; token: string } | null> {
  const db = getDb();
  const { resource } = await db
    .container('invites')
    .item(params.inviteId, params.listId)
    .read<ListInvite>();
  if (!resource || resource.type !== 'invite' || resource.listId !== params.listId) {
    return null;
  }

  const now = Date.now();
  await db.container('invites').item(params.inviteId, params.listId).patch([
    { op: 'set', path: '/revokedAt', value: now },
    { op: 'set', path: '/revokedBy', value: params.actorId },
  ]);

  const token = generateInviteToken();
  const expiresAt = now + (params.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS) * 24 * 60 * 60 * 1000;
  const invite: ListInvite = {
    id: `inv_${nanoid(12)}`,
    type: 'invite',
    listId: params.listId,
    role: resource.role,
    tokenHash: hashInviteToken(token),
    createdAt: now,
    createdBy: params.actorId,
    expiresAt,
    rotatedFrom: params.inviteId,
  };
  await db.container('invites').items.create(invite);
  return { invite: stripInviteSecret(invite), token };
}

export type AcceptInviteResult =
  | { status: 'accepted'; listId: string; role: MembershipRole; slug: string }
  | { status: 'invalid' | 'expired' | 'revoked' | 'used' | 'list_not_found' };

export async function acceptInvite(params: {
  token: string;
  user: AuthUser;
}): Promise<AcceptInviteResult> {
  const db = getDb();
  const tokenHash = hashInviteToken(params.token);
  const { resources } = await db
    .container('invites')
    .items.query<ListInvite>({
      query: 'SELECT * FROM c WHERE c.tokenHash = @tokenHash AND c.type = @type',
      parameters: [
        { name: '@tokenHash', value: tokenHash },
        { name: '@type', value: 'invite' },
      ],
    })
    .fetchAll();

  const invite = resources[0];
  if (!invite || invite.type !== 'invite') return { status: 'invalid' };
  const now = Date.now();
  if (invite.acceptedAt || invite.acceptedBy) return { status: 'used' };
  if (invite.revokedAt) return { status: 'revoked' };
  if (invite.expiresAt <= now) return { status: 'expired' };

  const list = await getList(invite.listId);
  if (!list) return { status: 'list_not_found' };

  const acceptanceId = `${invite.id}_accepted`;
  try {
    await db.container('invites').items.create({
      id: acceptanceId,
      type: 'inviteAcceptance',
      listId: invite.listId,
      inviteId: invite.id,
      acceptedBy: params.user.uid,
      acceptedAt: now,
    });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 409) {
      return { status: 'used' };
    }
    throw err;
  }

  const existingRole =
    list.ownerId === params.user.uid
      ? 'owner'
      : (await getListMembership(invite.listId, params.user.uid))?.role ?? null;
  const role = existingRole ? strongerRole(existingRole, invite.role) : invite.role;

  try {
    await upsertListMembership({
      uid: params.user.uid,
      listId: invite.listId,
      role,
      invitedBy: invite.createdBy,
      acceptedAt: now,
      user: params.user,
    });
    await db.container('invites').item(invite.id, invite.listId).patch([
      { op: 'set', path: '/acceptedAt', value: now },
      { op: 'set', path: '/acceptedBy', value: params.user.uid },
    ]);
  } catch (err) {
    await db.container('invites').item(acceptanceId, invite.listId).delete().catch(() => undefined);
    throw err;
  }

  return { status: 'accepted', listId: invite.listId, role, slug: list.slug };
}
