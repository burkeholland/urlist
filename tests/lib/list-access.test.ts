import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import {
  _resetSecretCache,
  createListAccessToken,
  createSessionToken,
  LIST_ACCESS_MAX_AGE_SECONDS,
} from '@/lib/auth';
import { cookieStoreHasListAccess, listRequiresPassword, requestHasListAccess } from '@/lib/list-access';

const SECRET = 'test-secret-for-vitest-minimum-32-chars';

const owner = { uid: 'owner-1', username: 'owner', name: 'Owner', avatar: '' };
const stranger = { uid: 'stranger-1', username: 'stranger', name: 'Stranger', avatar: '' };

const protectedTarget = {
  list: { visibility: 'password-protected' as const, ownerId: 'owner-1' },
  passwordUpdatedAt: 100,
};

function request(cookies: Record<string, string> = {}, bearer?: string): NextRequest {
  const headers = new Headers();
  const cookieHeader = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
  if (cookieHeader) headers.set('cookie', cookieHeader);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  return new NextRequest('https://urlist.test/api/lists/list-1', { headers });
}

function cookieStore(cookies: Record<string, string> = {}) {
  return {
    get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined),
  };
}

// Both entry points must make the same decision for the same cookies.
async function decisions(listId: string, target: typeof protectedTarget, cookies: Record<string, string>) {
  return [
    await requestHasListAccess(request(cookies), listId, target),
    await cookieStoreHasListAccess(cookieStore(cookies), listId, target),
  ];
}

describe('list access', () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = SECRET;
    _resetSecretCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only password-protected lists require a password; legacy lists without visibility stay public', () => {
    expect(listRequiresPassword({ visibility: 'password-protected' })).toBe(true);
    expect(listRequiresPassword({ visibility: 'unlisted' })).toBe(false);
    expect(listRequiresPassword({ visibility: 'public' })).toBe(false);
    expect(listRequiresPassword({})).toBe(false);
  });

  it.each([
    ['public', { visibility: 'public' as const, ownerId: 'owner-1' }],
    ['unlisted', { visibility: 'unlisted' as const, ownerId: 'owner-1' }],
    ['legacy', { ownerId: null }],
  ])('allows anyone to view %s lists without cookies', async (_label, list) => {
    expect(await decisions('list-1', { list, passwordUpdatedAt: 0 } as never, {})).toEqual([true, true]);
  });

  it('denies a protected list to an anonymous visitor', async () => {
    expect(await decisions('list-1', protectedTarget, {})).toEqual([false, false]);
  });

  it('lets the owner in with their session cookie', async () => {
    const session = await createSessionToken(owner);
    expect(await decisions('list-1', protectedTarget, { session })).toEqual([true, true]);
  });

  it('lets the owner in with a bearer token on API requests', async () => {
    const session = await createSessionToken(owner);
    await expect(requestHasListAccess(request({}, session), 'list-1', protectedTarget)).resolves.toBe(true);
  });

  it('does not treat another signed-in user as the owner', async () => {
    const session = await createSessionToken(stranger);
    expect(await decisions('list-1', protectedTarget, { session })).toEqual([false, false]);
  });

  it('grants access with an unlock cookie minted for this list and password version', async () => {
    const unlock = await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 100 });
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': unlock })).toEqual([true, true]);
  });

  it('still honors a valid unlock cookie when the session cookie is invalid', async () => {
    const unlock = await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 100 });
    expect(await decisions('list-1', protectedTarget, { session: 'garbage', 'list_access_list-1': unlock }))
      .toEqual([true, true]);
  });

  it('rejects an unlock cookie minted for a different list', async () => {
    const otherList = await createListAccessToken({ listId: 'list-2', passwordUpdatedAt: 100 });
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': otherList })).toEqual([false, false]);
  });

  it('rejects unlock cookies minted before the owner changed the password', async () => {
    const stale = await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 50 });
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': stale })).toEqual([false, false]);
  });

  it('rejects unlock cookies after they expire', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const unlock = await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 100 });
    vi.setSystemTime(new Date(Date.parse('2026-01-01T00:00:00Z') + (LIST_ACCESS_MAX_AGE_SECONDS - 60) * 1000));
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': unlock })).toEqual([true, true]);
    vi.setSystemTime(new Date(Date.parse('2026-01-01T00:00:00Z') + (LIST_ACCESS_MAX_AGE_SECONDS + 1) * 1000));
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': unlock })).toEqual([false, false]);
  });

  it('does not accept a session token in place of an unlock cookie', async () => {
    const session = await createSessionToken(stranger);
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': session })).toEqual([false, false]);
  });

  it('does not accept an unlock token in place of a session', async () => {
    const unlock = await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 100 });
    expect(await decisions('list-1', protectedTarget, { session: unlock })).toEqual([false, false]);
  });

  it('rejects tokens signed with the right secret but without the list-access audience', async () => {
    const noAudience = await new SignJWT({ listId: 'list-1', passwordUpdatedAt: 100 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': noAudience })).toEqual([false, false]);
  });

  it('rejects forged or tampered unlock cookies', async () => {
    const forged = await new SignJWT({ listId: 'list-1', passwordUpdatedAt: 100 })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('urlist:list-access')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-completely-different-secret-value!!'));
    const genuine = await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 100 });
    const tampered = genuine.slice(0, -2) + (genuine.endsWith('AA') ? 'BB' : 'AA');
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': forged })).toEqual([false, false]);
    expect(await decisions('list-1', protectedTarget, { 'list_access_list-1': tampered })).toEqual([false, false]);
  });

  it('skips the owner check for ownerless lists and relies on the unlock cookie', async () => {
    const ownerless = { list: { visibility: 'password-protected' as const, ownerId: null }, passwordUpdatedAt: 100 };
    const session = await createSessionToken(owner);
    const unlock = await createListAccessToken({ listId: 'list-1', passwordUpdatedAt: 100 });
    expect(await decisions('list-1', ownerless as never, { session })).toEqual([false, false]);
    expect(await decisions('list-1', ownerless as never, { 'list_access_list-1': unlock })).toEqual([true, true]);
  });
});
