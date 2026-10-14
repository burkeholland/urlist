import type { NextRequest } from 'next/server';
import {
  getListAccessCookieName,
  SESSION_COOKIE_NAME,
  verifyAuth,
  verifyListAccessToken,
  verifySessionToken,
} from './auth';
import type { ListAccessRecord } from './rtdb';
import type { ListRecord } from './types';

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

type AccessTarget = Pick<ListAccessRecord, 'passwordUpdatedAt'> & {
  list: Pick<ListRecord, 'visibility' | 'ownerId'>;
};

// Lists saved before visibility existed have no field and stay public.
export function listRequiresPassword(list: Pick<ListRecord, 'visibility'>): boolean {
  return list.visibility === 'password-protected';
}

// Owners always pass; everyone else needs an unlock token minted for the current password.
async function hasListAccess(
  listId: string,
  target: AccessTarget,
  getViewerUid: () => Promise<string | null>,
  accessToken: string | undefined,
): Promise<boolean> {
  if (!listRequiresPassword(target.list)) return true;
  if (target.list.ownerId && (await getViewerUid()) === target.list.ownerId) return true;
  return verifyListAccessToken(accessToken, listId, target.passwordUpdatedAt);
}

export function requestHasListAccess(
  request: NextRequest,
  listId: string,
  target: AccessTarget,
): Promise<boolean> {
  return hasListAccess(
    listId,
    target,
    async () => (await verifyAuth(request)).uid,
    request.cookies.get(getListAccessCookieName(listId))?.value,
  );
}

export function cookieStoreHasListAccess(
  cookieStore: CookieReader,
  listId: string,
  target: AccessTarget,
): Promise<boolean> {
  return hasListAccess(
    listId,
    target,
    async () => {
      const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      return sessionToken ? (await verifySessionToken(sessionToken)).uid : null;
    },
    cookieStore.get(getListAccessCookieName(listId))?.value,
  );
}
