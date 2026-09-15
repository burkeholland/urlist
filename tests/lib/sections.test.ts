import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTION_ID,
  DEFAULT_SECTION_NAME,
  findDuplicateSectionId,
  findOrphanSectionReference,
  getPublicSectionGroups,
  hasExplicitSections,
  normalizeLinkSections,
  normalizeSections,
  reindexLinksBySection,
} from '@/lib/sections';
import type { LinkWithId, ListSection } from '@/lib/types';

const section = (id: string, name: string, position: number): ListSection => ({ id, name, position });
const link = (id: string, sectionId: string | undefined, position: number, pinned = false): LinkWithId => ({
  id,
  url: `https://example.com/${id}`,
  sectionId,
  position,
  pinned,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  ogSiteName: null,
  createdAt: 1,
});

describe('section helpers', () => {
  it('normalizes legacy lists to a default section', () => {
    expect(normalizeSections(undefined)).toEqual([{ id: DEFAULT_SECTION_ID, name: DEFAULT_SECTION_NAME, position: 0 }]);
    expect(hasExplicitSections(normalizeSections(undefined))).toBe(false);
  });

  it('sorts, trims, reindexes, and de-duplicates stored sections defensively', () => {
    expect(normalizeSections([
      section('b', '  Beta  ', 3),
      section('a', 'Alpha', 1),
      section('b', 'Duplicate', 2),
      section('', 'Missing id', 0),
    ])).toEqual([
      section('a', 'Alpha', 0),
      section('b', 'Beta', 1),
    ]);
  });

  it('detects duplicate and orphan section references for API validation', () => {
    expect(findDuplicateSectionId([section('a', 'A', 0), section('a', 'Again', 1)])).toBe('a');
    expect(findDuplicateSectionId([section('a', 'A', 0), section('b', 'B', 1)])).toBeNull();
    expect(findOrphanSectionReference([{ sectionId: 'missing' }], [section('a', 'A', 0)])).toBe('missing');
    expect(findOrphanSectionReference([{ sectionId: 'a' }, {}], [section('a', 'A', 0)])).toBeNull();
  });

  it('defaults legacy link references and reindexes within each section', () => {
    const sections = [section('a', 'A', 0), section('b', 'B', 1)];
    expect(normalizeLinkSections([link('one', undefined, 0), link('two', 'missing', 0)], sections).map((l) => l.sectionId)).toEqual(['a', 'a']);
    expect(reindexLinksBySection([
      link('one', 'b', 4),
      link('two', 'b', 2),
      link('three', 'a', 9),
    ], sections).map((l) => ({ id: l.id, sectionId: l.sectionId, position: l.position }))).toEqual([
      { id: 'one', sectionId: 'b', position: 1 },
      { id: 'two', sectionId: 'b', position: 0 },
      { id: 'three', sectionId: 'a', position: 0 },
    ]);
  });

  it('builds public groups in section order and excludes pinned links', () => {
    const groups = getPublicSectionGroups([
      link('pinned', 'a', 0, true),
      link('b2', 'b', 1),
      link('a1', 'a', 0),
      link('b1', 'b', 0),
    ], [section('b', 'B', 1), section('a', 'A', 0)]);

    expect(groups.map((group) => [group.section.id, group.links.map((item) => item.id)])).toEqual([
      ['a', ['a1']],
      ['b', ['b1', 'b2']],
    ]);
    expect(hasExplicitSections(groups.map((group) => group.section))).toBe(true);
  });
});
