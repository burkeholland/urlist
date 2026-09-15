import type { LinkWithId, PublicListWithLinks } from './types';

export const DEFAULT_VISIBLE_TIMEZONE = 'UTC';

export type LinkVisibilityStatus = 'upcoming' | 'active' | 'expired';

export interface LinkScheduleFields {
  visibleFrom?: number | null;
  visibleUntil?: number | null;
  visibleTimezone?: string | null;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function hasVisibilitySchedule(link: LinkScheduleFields): boolean {
  return link.visibleFrom != null || link.visibleUntil != null;
}

export function getLinkScheduleError(link: LinkScheduleFields): string | null {
  if (link.visibleFrom != null && (!Number.isInteger(link.visibleFrom) || link.visibleFrom < 0)) {
    return 'Visible from must be a valid UTC timestamp.';
  }
  if (link.visibleUntil != null && (!Number.isInteger(link.visibleUntil) || link.visibleUntil < 0)) {
    return 'Visible until must be a valid UTC timestamp.';
  }
  if (link.visibleFrom != null && link.visibleUntil != null && link.visibleFrom >= link.visibleUntil) {
    return 'Visible until must be after visible from.';
  }
  if (hasVisibilitySchedule(link)) {
    if (!link.visibleTimezone) return 'Choose a display time zone for scheduled links.';
    if (!isValidTimeZone(link.visibleTimezone)) return 'Choose a valid display time zone.';
  }
  return null;
}

export function normalizeLinkSchedule(link: LinkScheduleFields): Required<LinkScheduleFields> {
  const visibleFrom = link.visibleFrom ?? null;
  const visibleUntil = link.visibleUntil ?? null;
  const visibleTimezone = visibleFrom != null || visibleUntil != null
    ? link.visibleTimezone ?? DEFAULT_VISIBLE_TIMEZONE
    : null;

  return { visibleFrom, visibleUntil, visibleTimezone };
}

export function getLinkVisibilityStatus(
  link: LinkScheduleFields,
  now = Date.now(),
): LinkVisibilityStatus {
  if (link.visibleFrom != null && now < link.visibleFrom) return 'upcoming';
  if (link.visibleUntil != null && now >= link.visibleUntil) return 'expired';
  return 'active';
}

export function isLinkVisible(link: LinkScheduleFields, now = Date.now()): boolean {
  return getLinkVisibilityStatus(link, now) === 'active';
}

export function filterVisibleLinks<T extends LinkWithId>(links: T[], now = Date.now()): T[] {
  return links.filter((link) => isLinkVisible(link, now));
}

export function withVisibleLinks<T extends { links: LinkWithId[] }>(list: T, now = Date.now()): T {
  return { ...list, links: filterVisibleLinks(list.links, now) };
}

export function getNextVisibilityChangeAt(links: LinkScheduleFields[], now = Date.now()): number | null {
  const next = links
    .flatMap((link) => [link.visibleFrom, link.visibleUntil])
    .filter((timestamp): timestamp is number => timestamp != null && timestamp > now)
    .sort((a, b) => a - b)[0];

  return next ?? null;
}

export function toPublicListPayload<T extends Omit<PublicListWithLinks, 'nextVisibilityChangeAt'>>(
  list: T,
  now = Date.now(),
): PublicListWithLinks {
  return {
    ...withVisibleLinks(list, now),
    nextVisibilityChangeAt: getNextVisibilityChangeAt(list.links, now),
  };
}
