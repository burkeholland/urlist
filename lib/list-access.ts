import type { NextRequest } from 'next/server';
import { getListAccessCookieName, verifyAuth, verifyListAccessToken, verifySessionToken } from './auth';
import type { ListRecord, ListVisibility } from './types';

export const DEFAULT_LIST_VISIBILITY: ListVisibility = 'public';

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export function getEffectiveVisibility(list: Pick<ListRecord, 'visibility'> | { visibility?: ListVisibility | null }): ListVisibility {
  return list.visibility ?? DEFAULT_LIST_VISIBILITY;
}

export function listRequiresPassword(list: Pick<ListRecord, 'visibility' | 'hasPassword'>): boolean {
  void list.hasPassword;
  return getEffectiveVisibility(list) === 'password-protected';
}

export async function requestOwnsList(request: NextRequest, list: Pick<ListRecord, 'ownerId'>): Promise<boolean> {
  if (!list.ownerId) return false;
  const authResult = await verifyAuth(request);
  return authResult.authenticated && authResult.uid === list.ownerId;
}

export async function cookieStoreOwnsList(
  cookieStore: CookieReader,
  list: Pick<ListRecord, 'ownerId'>,
): Promise<boolean> {
  if (!list.ownerId) return false;
  const sessionCookie = cookieStore.get('session')?.value;
  if (!sessionCookie) return false;
  const authResult = await verifySessionToken(sessionCookie);
  return authResult.authenticated && authResult.uid === list.ownerId;
}

export async function requestHasListAccess(
  request: NextRequest,
  listId: string,
  list: Pick<ListRecord, 'visibility' | 'hasPassword' | 'ownerId'>,
  passwordUpdatedAt: number,
): Promise<boolean> {
  if (!listRequiresPassword(list)) return true;
  if (await requestOwnsList(request, list)) return true;
  return verifyListAccessToken(
    request.cookies.get(getListAccessCookieName(listId))?.value,
    listId,
    passwordUpdatedAt,
  );
}

export async function cookieStoreHasListAccess(
  cookieStore: CookieReader,
  listId: string,
  list: Pick<ListRecord, 'visibility' | 'hasPassword' | 'ownerId'>,
  passwordUpdatedAt: number,
): Promise<boolean> {
  if (!listRequiresPassword(list)) return true;
  if (await cookieStoreOwnsList(cookieStore, list)) return true;
  return verifyListAccessToken(
    cookieStore.get(getListAccessCookieName(listId))?.value,
    listId,
    passwordUpdatedAt,
  );
}
