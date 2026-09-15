export type LinkPinnedFilter = 'all' | 'pinned' | 'unpinned';

export interface LinkFilterState {
  query: string;
  domain: string;
  pinned: LinkPinnedFilter;
}

export interface IndexedLink<T extends SearchableLink> {
  link: T;
  domain: string;
  searchText: string;
}

export interface LinkDomainOption {
  value: string;
  label: string;
  count: number;
}

type SearchableLink = {
  url: string;
  pinned: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
};

const DEFAULT_FILTERS: LinkFilterState = {
  query: '',
  domain: 'all',
  pinned: 'all',
};

export function defaultLinkFilters(): LinkFilterState {
  return { ...DEFAULT_FILTERS };
}

export function clearLinkFilters(): LinkFilterState {
  return defaultLinkFilters();
}

export function hasActiveLinkFilters(filters: LinkFilterState): boolean {
  return filters.query.trim().length > 0 || filters.domain !== 'all' || filters.pinned !== 'all';
}

export function normalizeLinkQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function getLinkDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function buildLinkSearchText(link: SearchableLink): string {
  return [
    link.ogTitle ?? '',
    link.ogDescription ?? '',
    getLinkDomain(link.url),
    link.url,
  ]
    .join(' ')
    .toLowerCase();
}

export function indexLinks<T extends SearchableLink>(links: T[]): IndexedLink<T>[] {
  return links.map((link) => ({
    link,
    domain: getLinkDomain(link.url),
    searchText: buildLinkSearchText(link),
  }));
}

export function filterIndexedLinks<T extends SearchableLink>(
  links: IndexedLink<T>[],
  filters: LinkFilterState,
): IndexedLink<T>[] {
  const query = normalizeLinkQuery(filters.query);

  return links.filter(({ domain, searchText, link }) => {
    if (query && !searchText.includes(query)) return false;
    if (filters.domain !== 'all' && domain !== filters.domain) return false;
    if (filters.pinned === 'pinned' && !link.pinned) return false;
    if (filters.pinned === 'unpinned' && link.pinned) return false;
    return true;
  });
}

export function getLinkDomainOptions<T extends SearchableLink>(links: IndexedLink<T>[]): LinkDomainOption[] {
  const counts = new Map<string, number>();
  for (const { domain } of links) {
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function getLinkFilterSummary(
  visibleCount: number,
  totalCount: number,
  filters: LinkFilterState,
): string {
  if (!hasActiveLinkFilters(filters)) {
    return `${totalCount} link${totalCount === 1 ? '' : 's'} available`;
  }

  const parts: string[] = [];

  if (filters.query.trim()) {
    parts.push(`search "${filters.query.trim()}"`);
  }
  if (filters.domain !== 'all') {
    parts.push(`domain ${filters.domain}`);
  }
  if (filters.pinned === 'pinned') {
    parts.push('pinned links');
  } else if (filters.pinned === 'unpinned') {
    parts.push('unpinned links');
  }

  return `Showing ${visibleCount} of ${totalCount} link${totalCount === 1 ? '' : 's'}${parts.length ? ` for ${parts.join(', ')}` : ''}`;
}

export function getLinkEmptyStateMessage(
  visibleCount: number,
  totalCount: number,
  filters: LinkFilterState,
): string {
  if (totalCount === 0) {
    return 'No links added yet. Paste a URL above to get started.';
  }

  if (visibleCount === 0 && hasActiveLinkFilters(filters)) {
    return 'No links match the current search and filters.';
  }

  return '';
}
