'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/nav-header';
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

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  // Fetch user's lists
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

  const handleDelete = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list? This cannot be undone.')) return;

    setDeletingId(listId);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setLists((prev) => prev.filter((l) => l.listId !== listId));
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

  if (authLoading) {
    return (
      <div>
        <NavHeader />
        <main className="page">
          <div className="loading-skeleton">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
          </div>
        </main>
        <style jsx>{`
          .page {
            max-width: 860px;
            margin: 0 auto;
            padding: 28px 16px 48px;
          }
          .loading-skeleton {
            display: grid;
            gap: 10px;
          }
          .skeleton {
            border-radius: 8px;
            background: var(--bg-secondary);
          }
          .skeleton-title {
            height: 26px;
            width: 140px;
          }
          .skeleton-row {
            height: 38px;
            width: 100%;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div>
      <NavHeader />
      <main className="page">
        <div className="my-header">
          <h1>My lists</h1>
          <Link href="/app/compose" className="btn btn-primary btn-sm">
            New list
          </Link>
        </div>

        {fetching ? (
          <div className="loading-skeleton">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton-row" />
            ))}
          </div>
        ) : lists.length === 0 ? (
          <div className="empty-state">
            <p>
              No lists.{' '}
              <Link href="/app/compose" className="link-style">
                Create one
              </Link>
            </p>
          </div>
        ) : (
          <div id="my-lists">
            {lists.map((list) => (
              <div key={list.listId} className="my-row">
                <div className="my-slug">
                  <Link href={`/${list.slug}`}>/{list.slug}</Link>
                </div>
                <div className="my-stats">
                  <span className="stat-badge" title="Views">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {list.stats?.totalViews ?? 0}
                  </span>
                  <span className="stat-badge" title="Clicks">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>
                    {list.stats?.totalClicks ?? 0}
                  </span>
                </div>
                <span className="count-badge">{list.links.length}</span>
                <div className="my-actions">
                  <Link href={`/app/analytics/${list.listId}`} className="analytics-link" title="Analytics">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                  </Link>
                  <Link href={`/app/compose/${list.listId}`}>Edit</Link>
                  <button
                    onClick={() => handleDelete(list.listId)}
                    disabled={deletingId === list.listId}
                    className="delete"
                  >
                    {deletingId === list.listId ? 'Deleting...' : 'Delete'}
                  </button>
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
        .my-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .my-header h1 {
          font-size: 20px;
          font-weight: 600;
        }
        .my-row {
          display: flex;
          align-items: center;
          padding: 9px 0;
          border-bottom: 1px solid var(--border);
          gap: 8px;
        }
        .my-row:first-child {
          border-top: 1px solid var(--border);
        }
        .my-stats {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .stat-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .count-badge {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 2px 8px;
          border-radius: 10px;
        }
        .analytics-link {
          display: inline-flex;
          align-items: center;
          color: var(--text-muted);
          transition: color 0.15s;
        }
        .analytics-link:hover {
          color: var(--accent);
        }
        .my-slug {
          font-family: var(--font-mono);
          font-size: 15px;
          font-weight: 500;
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .my-slug a {
          color: var(--link);
          text-decoration: none;
        }
        .my-slug a:hover {
          text-decoration: underline;
        }
        .my-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .my-actions a,
        .my-actions button {
          font-size: 14px;
          color: var(--text-muted);
          text-decoration: none;
          transition: color 0.15s;
          background: none;
          border: 0;
          padding: 0;
          margin: 0;
          line-height: 1.2;
        }
        .my-actions a:hover,
        .my-actions button:hover {
          color: var(--text);
        }
        .my-actions .delete:hover {
          color: var(--danger);
        }
        .my-actions .delete:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }
        .empty-state {
          padding: 32px 0;
          text-align: center;
        }
        .empty-state p {
          font-family: var(--font-mono);
          font-size: 15px;
          color: var(--text-muted);
        }
        .loading-skeleton {
          display: grid;
          gap: 10px;
        }
        .skeleton {
          border-radius: 8px;
          background: var(--bg-secondary);
        }
        .skeleton-row {
          height: 38px;
          width: 100%;
        }
      `}</style>
    </div>
  );
}
