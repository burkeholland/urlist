import { getListMembership } from './rtdb';
import type { ListRecord, MembershipRole } from './types';

const ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export async function getEffectiveListRole(
  listId: string,
  list: ListRecord,
  uid: string,
): Promise<MembershipRole | null> {
  if (list.ownerId === uid) return 'owner';
  const membership = await getListMembership(listId, uid);
  return membership?.role ?? null;
}

export function hasMinimumRole(role: MembershipRole | null, minimum: MembershipRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function canManageCollaborators(role: MembershipRole | null): boolean {
  return role === 'owner';
}
