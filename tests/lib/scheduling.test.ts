import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterVisibleLinks,
  getLinkScheduleError,
  getLinkVisibilityStatus,
  isLinkVisible,
  normalizeLinkSchedule,
  withVisibleLinks,
} from '@/lib/scheduling';
import type { LinkWithId } from '@/lib/types';

const baseLink = (overrides: Partial<LinkWithId> = {}): LinkWithId => ({
  id: 'link-1',
  url: 'https://example.com',
  position: 0,
  pinned: false,
  visibleFrom: null,
  visibleUntil: null,
  visibleTimezone: null,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  createdAt: 1,
  ...overrides,
});

describe('link scheduling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats legacy links without a schedule as active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    expect(getLinkVisibilityStatus(baseLink())).toBe('active');
    expect(isLinkVisible(baseLink())).toBe(true);
  });

  it('uses inclusive visibleFrom and exclusive visibleUntil boundaries', () => {
    const from = Date.parse('2026-01-01T12:00:00.000Z');
    const until = Date.parse('2026-01-01T13:00:00.000Z');
    const link = baseLink({ visibleFrom: from, visibleUntil: until, visibleTimezone: 'UTC' });

    expect(isLinkVisible(link, from - 1)).toBe(false);
    expect(isLinkVisible(link, from)).toBe(true);
    expect(isLinkVisible(link, until - 1)).toBe(true);
    expect(isLinkVisible(link, until)).toBe(false);
  });

  it('distinguishes start-only and end-only schedules with a controlled clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    expect(getLinkVisibilityStatus(baseLink({
      visibleFrom: Date.parse('2026-01-01T12:01:00.000Z'),
      visibleTimezone: 'UTC',
    }))).toBe('upcoming');
    expect(getLinkVisibilityStatus(baseLink({
      visibleUntil: Date.parse('2026-01-01T12:00:00.000Z'),
      visibleTimezone: 'UTC',
    }))).toBe('expired');
  });

  it('filters inactive links from list payloads without mutating the source', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    const active = baseLink({ id: 'active' });
    const upcoming = baseLink({
      id: 'upcoming',
      visibleFrom: Date.parse('2026-01-01T12:01:00.000Z'),
      visibleTimezone: 'UTC',
    });
    const expired = baseLink({
      id: 'expired',
      visibleUntil: now,
      visibleTimezone: 'UTC',
    });
    const links = [active, upcoming, expired];

    expect(filterVisibleLinks(links, now).map((link) => link.id)).toEqual(['active']);
    expect(withVisibleLinks({ links }, now).links.map((link) => link.id)).toEqual(['active']);
    expect(links.map((link) => link.id)).toEqual(['active', 'upcoming', 'expired']);
  });

  it('validates ranges, timestamps, and display time zones', () => {
    expect(getLinkScheduleError({ visibleFrom: 2, visibleUntil: 2, visibleTimezone: 'UTC' })).toBe(
      'Visible until must be after visible from.',
    );
    expect(getLinkScheduleError({ visibleFrom: 1.5, visibleUntil: null, visibleTimezone: 'UTC' })).toBe(
      'Visible from must be a valid UTC timestamp.',
    );
    expect(getLinkScheduleError({ visibleFrom: 1, visibleUntil: null, visibleTimezone: null })).toBe(
      'Choose a display time zone for scheduled links.',
    );
    expect(getLinkScheduleError({ visibleFrom: 1, visibleUntil: null, visibleTimezone: 'Mars/Olympus' })).toBe(
      'Choose a valid display time zone.',
    );
  });

  it('normalizes missing legacy schedule fields and only keeps timezone when scheduled', () => {
    expect(normalizeLinkSchedule({})).toEqual({
      visibleFrom: null,
      visibleUntil: null,
      visibleTimezone: null,
    });
    expect(normalizeLinkSchedule({ visibleFrom: 1 })).toEqual({
      visibleFrom: 1,
      visibleUntil: null,
      visibleTimezone: 'UTC',
    });
  });
});
