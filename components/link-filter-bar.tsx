'use client';

import { useId } from 'react';
import type { LinkDomainOption, LinkFilterState, LinkPinnedFilter } from '@/lib/link-filters';
import { getLinkFilterSummary, hasActiveLinkFilters } from '@/lib/link-filters';

interface LinkFilterBarProps {
  filters: LinkFilterState;
  onChange: (next: LinkFilterState) => void;
  onClear: () => void;
  visibleCount: number;
  totalCount: number;
  domainOptions: LinkDomainOption[];
  label: string;
}

const PINNED_OPTIONS: Array<{ value: LinkPinnedFilter; label: string }> = [
  { value: 'all', label: 'All links' },
  { value: 'pinned', label: 'Pinned only' },
  { value: 'unpinned', label: 'Unpinned only' },
];

export function LinkFilterBar({
  filters,
  onChange,
  onClear,
  visibleCount,
  totalCount,
  domainOptions,
  label,
}: LinkFilterBarProps) {
  const searchId = useId();
  const domainId = useId();
  const pinnedId = useId();
  const summary = getLinkFilterSummary(visibleCount, totalCount, filters);
  const clearDisabled = !hasActiveLinkFilters(filters);

  return (
    <section className="link-filter-bar" aria-label={label}>
      <div className="link-filter-grid">
        <div className="field-group">
          <label htmlFor={searchId} className="label">
            Search links
          </label>
          <input
            id={searchId}
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="Search title, description, domain, or URL"
            className="input"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${searchId}-summary`}
          />
        </div>

        <div className="field-group">
          <label htmlFor={domainId} className="label">
            Domain
          </label>
          <select
            id={domainId}
            className="input"
            value={filters.domain}
            onChange={(e) => onChange({ ...filters, domain: e.target.value })}
          >
            <option value="all">All domains</option>
            {domainOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor={pinnedId} className="label">
            Pinned
          </label>
          <select
            id={pinnedId}
            className="input"
            value={filters.pinned}
            onChange={(e) => onChange({ ...filters, pinned: e.target.value as LinkPinnedFilter })}
          >
            {PINNED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-actions">
          <button type="button" className="btn" onClick={onClear} disabled={clearDisabled}>
            Clear all
          </button>
        </div>
      </div>

      <div className="link-filter-summary" id={`${searchId}-summary`}>
        <span>{summary}</span>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {summary}
        </div>
      </div>

      <style jsx>{`
        .link-filter-bar {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 14px 0 10px;
          padding: 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--surface);
        }

        .link-filter-grid {
          display: grid;
          grid-template-columns: minmax(220px, 1.5fr) minmax(160px, 1fr) minmax(150px, 1fr) auto;
          gap: 10px;
          align-items: end;
        }

        .field-group {
          min-width: 0;
        }

        .filter-actions {
          display: flex;
          justify-content: flex-end;
        }

        .link-filter-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 13px;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @media (max-width: 860px) {
          .link-filter-grid {
            grid-template-columns: 1fr 1fr;
          }

          .filter-actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 560px) {
          .link-filter-grid {
            grid-template-columns: 1fr;
          }

          .link-filter-summary {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
