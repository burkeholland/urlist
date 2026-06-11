'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/nav-header';
import { ConfirmModal } from '@/components/confirm-modal';
import { useAuth } from '@/hooks/use-auth';
import type { ListWithLinks, ListAnalyticsSummary } from '@/lib/types';

type ListWithStats = ListWithLinks & {
  stats?: ListAnalyticsSummary;
};

export default function MyLinksPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [lists, setLists] = useState<ListWithStats[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ListWithStats | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    async function fetchLists() {
      if (!user) return;
      try {
        const res = await fetch('/api/lists?includeStats=true', { credentials: 'include' });
        if (!res.ok) {
          setLists([]);
          return;
        }
        const data = await res.json();
        setLists(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch lists:', err);
      } finally {
        setFetching(false);
      }
    }

    if (!authLoading && user) {
      void fetchLists();
    }
  }, [authLoading, user]);

  const handleDelete = async (e: React.MouseEvent, list: ListWithStats) => {
    e.stopPropagation();
    setPendingDelete(list);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const list = pendingDelete;
    setPendingDelete(null);
    setDeletingId(list.listId);
    try {
      const res = await fetch(`/api/lists/${list.listId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setLists((prev) => prev.filter((l) => l.listId !== list.listId));
      } else {
        const data = await res.json();
        alert(data.error?.message || 'Failed to delete list.');
      }
    } catch {
      alert('Something went wrong.');
    } finally {
      setDeletingId(null);
    }
  };

  const skeletonGrid = (
    <div className="tile-grid">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-tile" />
      ))}
    </div>
  );

  if (authLoading) {
    return (
      <div>
        <NavHeader />
        <main className="page">{skeletonGrid}</main>
        <style jsx>{`
          .page { max-width: 860px; margin: 0 auto; padding: 28px 16px 48px; }
          .tile-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
          .skeleton-tile { aspect-ratio: 1; border-radius: var(--radius); background: var(--bg-secondary); }
          @media (max-width: 900px) { .tile-grid { grid-template-columns: repeat(3, 1fr); } }
          @media (max-width: 600px) { .tile-grid { grid-template-columns: repeat(2, 1fr); } }
        `}</style>
      </div>
    );
  }

  return (
    <div>
      <NavHeader />
      <main className="page">
        <h1 className="page-title">My lists</h1>

        {fetching ? skeletonGrid : (
          <div className="tile-grid">
            {/* Create new list tile */}
            <div
              className="tile create-tile"
              onClick={() => router.push('/app/compose')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && router.push('/app/compose')}
            >
              <div className="create-inner">
                <div className="create-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span className="create-label">Create new list</span>
              </div>
            </div>

            {lists.map((list) => (
              <div
                key={list.listId}
                className="tile list-tile"
                onClick={() => router.push(`/app/compose/${list.listId}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && router.push(`/app/compose/${list.listId}`)}
              >
                <div className="tile-top">
                  <div className="tile-slug">
                    <span className="slug-slash">/</span>
                    <span className="slug-name">{list.slug}</span>
                  </div>
                  {list.description && (
                    <p className="tile-desc">{list.description}</p>
                  )}
                </div>
                <div className="tile-bottom">
                  <div className="stats-row">
                    <span className="stat-pill">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                      {list.stats?.totalViews ?? 0}
                    </span>
                    <span className="stat-pill">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
                      </svg>
                      {list.stats?.totalClicks ?? 0}
                    </span>
                  </div>
                  <div className="tile-meta">
                    <span className="link-count">{list.links.length} links</span>
                    <div className="tile-actions">
                      <a
                        href={`/${list.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-btn icon-btn-link"
                        title="View public URL"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </a>
                      <button
                        className="icon-btn icon-btn-analytics"
                        title="Analytics"
                        onClick={(e) => { e.stopPropagation(); router.push(`/app/analytics/${list.listId}`); }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 20V10M12 20V4M6 20v-6"/>
                        </svg>
                      </button>
                      <button
                        className="icon-btn icon-btn-delete"
                        title="Delete"
                        disabled={deletingId === list.listId}
                        onClick={(e) => handleDelete(e, list)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <style jsx>{`
        .page {
          max-width: 860px;
          margin: 0 auto;
          padding: 28px 16px 48px;
        }
        .page-title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 16px;
        }
        /* Grid */
        .tile-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        @media (max-width: 900px) {
          .tile-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 600px) {
          .tile-grid { grid-template-columns: repeat(2, 1fr); }
        }
        /* Base tile */
        .tile {
          aspect-ratio: 1;
          padding: 12px;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--surface);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s, background 0.15s;
        }
        .tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
          border-color: var(--input-border);
        }
        /* Create tile */
        .create-tile {
          border: 1.5px dashed var(--border);
          background: transparent;
          justify-content: center;
          align-items: center;
        }
        .create-tile:hover {
          border-color: var(--accent);
          background: var(--blue-bg);
        }
        .create-tile:hover .create-icon {
          background: var(--accent);
          color: white;
        }
        .create-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .create-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--blue-bg);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .create-label {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
        }
        /* List tile - top */
        .tile-top {
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow: hidden;
        }
        .tile-slug {
          font-family: var(--font-mono);
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .slug-slash {
          color: var(--accent);
        }
        .slug-name {
          color: var(--text);
        }
        .tile-desc {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.4;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        /* List tile - bottom */
        .tile-bottom {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stats-row {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .stat-pill {
          font-family: var(--font-mono);
          font-size: 13px;
          background: var(--bg-secondary);
          border-radius: 3px;
          padding: 4px 7px;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .tile-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .link-count {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-muted);
        }
        .tile-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .icon-btn {
          background: none;
          border: none;
          padding: 0;
          margin: 0;
          cursor: pointer;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          transition: color 0.15s;
          line-height: 1;
          text-decoration: none;
        }
        .icon-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .icon-btn-link:hover { color: var(--link); }
        .icon-btn-analytics:hover { color: var(--accent); }
        .icon-btn-delete:hover { color: var(--danger); }
        /* Skeleton */
        .skeleton-tile {
          aspect-ratio: 1;
          border-radius: var(--radius);
          background: var(--bg-secondary);
        }
      `}</style>
      {pendingDelete && (
        <ConfirmModal
          title={`Delete /${pendingDelete.slug}?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
