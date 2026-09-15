import { describe, expect, it } from 'vitest';
import {
  buildLinkSearchText,
  clearLinkFilters,
  defaultLinkFilters,
  filterIndexedLinks,
  getLinkDomain,
  getLinkDomainOptions,
  getLinkEmptyStateMessage,
  getLinkFilterSummary,
  hasActiveLinkFilters,
  indexLinks,
} from '@/lib/link-filters';

const links = [
  {
    id: 'a',
    url: 'https://www.Example.com/path',
    pinned: true,
    ogTitle: 'Alpha Title',
    ogDescription: 'First description',
  },
  {
    id: 'b',
    url: 'https://beta.example.com/guide',
    pinned: false,
    ogTitle: 'Beta Note',
    ogDescription: 'Second description',
  },
  {
    id: 'c',
    url: 'https://other.example.org/landing',
    pinned: false,
    ogTitle: null,
    ogDescription: null,
  },
] as const;

describe('link-filters', () => {
  it('normalizes domains and strips www.', () => {
    expect(getLinkDomain('https://www.Example.com/path')).toBe('example.com');
    expect(getLinkDomain('bad-url')).toBe('bad-url');
  });

  it('builds searchable text from title, description, domain, and URL', () => {
    expect(buildLinkSearchText(links[0])).toContain('alpha title');
    expect(buildLinkSearchText(links[0])).toContain('first description');
    expect(buildLinkSearchText(links[0])).toContain('example.com');
    expect(buildLinkSearchText(links[0])).toContain('https://www.example.com/path');
  });

  it('matches case-insensitive queries across title, description, domain, and URL', () => {
    const indexed = indexLinks([...links]);
    expect(filterIndexedLinks(indexed, { query: 'alpha', domain: 'all', pinned: 'all' }).map((item) => item.link.id)).toEqual(['a']);
    expect(filterIndexedLinks(indexed, { query: 'FIRST', domain: 'all', pinned: 'all' }).map((item) => item.link.id)).toEqual(['a']);
    expect(filterIndexedLinks(indexed, { query: 'beta.example.com', domain: 'all', pinned: 'all' }).map((item) => item.link.id)).toEqual(['b']);
    expect(filterIndexedLinks(indexed, { query: '/landing', domain: 'all', pinned: 'all' }).map((item) => item.link.id)).toEqual(['c']);
  });

  it('applies domain and pinned filters together', () => {
    const indexed = indexLinks([...links]);
    expect(filterIndexedLinks(indexed, { query: '', domain: 'example.com', pinned: 'pinned' }).map((item) => item.link.id)).toEqual(['a']);
    expect(filterIndexedLinks(indexed, { query: '', domain: 'beta.example.com', pinned: 'unpinned' }).map((item) => item.link.id)).toEqual(['b']);
    expect(filterIndexedLinks(indexed, { query: '', domain: 'other.example.org', pinned: 'pinned' })).toEqual([]);
  });

  it('derives domain options with counts', () => {
    const indexed = indexLinks([...links]);
    expect(getLinkDomainOptions(indexed)).toEqual([
      { value: 'beta.example.com', label: 'beta.example.com', count: 1 },
      { value: 'example.com', label: 'example.com', count: 1 },
      { value: 'other.example.org', label: 'other.example.org', count: 1 },
    ]);
  });

  it('reports active filters, clear-all defaults, and empty states', () => {
    const filters = { query: '  beta ', domain: 'example.com', pinned: 'pinned' as const };
    expect(hasActiveLinkFilters(filters)).toBe(true);
    expect(defaultLinkFilters()).toEqual({ query: '', domain: 'all', pinned: 'all' });
    expect(clearLinkFilters()).toEqual({ query: '', domain: 'all', pinned: 'all' });
    expect(getLinkFilterSummary(0, 3, filters)).toContain('Showing 0 of 3 links');
    expect(getLinkFilterSummary(3, 3, defaultLinkFilters())).toBe('3 links available');
    expect(getLinkEmptyStateMessage(0, 3, filters)).toBe('No links match the current search and filters.');
    expect(getLinkEmptyStateMessage(0, 0, defaultLinkFilters())).toBe('No links added yet. Paste a URL above to get started.');
  });
});
