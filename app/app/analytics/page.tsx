'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavHeader } from '@/components/nav-header';
import { useAuth } from '@/hooks/use-auth';
import type { GlobalAnalytics } from '@/lib/types';

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const from = Date.now() - range * 24 * 60 * 60 * 1000;
        const res = await fetch(`/api/analytics?from=${from}`, { credentials: 'include' });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error?.message || 'Failed to load analytics.');
          return;
        }
        setData(await res.json());
      } catch {
        setError('Something went wrong.');
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading && user) {
      void fetchAnalytics();
    }
  }, [authLoading, user, range]);

  if (authLoading) {
    return (
      <div>
        <NavHeader />
        <main className="page"><div className="loading-skeleton"><div className="skeleton skeleton-title" /></div></main>
        <style jsx>{skeletonStyles}</style>
      </div>
    );
  }

  return (
    <div>
      <NavHeader />
      <main className="page">
        <div className="analytics-header">
          <h1 className="page-title">Analytics</h1>
          <div className="range-toggle">
            {([7, 30, 90] as const).map((d) => (
              <button key={d} className={range === d ? 'active' : ''} onClick={() => setRange(d)}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loading-skeleton">
            {[1, 2, 3, 4].map((i) => (<div key={i} className="skeleton skeleton-card" />))}
          </div>
        ) : error ? (
          <div className="empty-state"><p>{error}</p></div>
        ) : data ? (
          <>
            <div className="overview-cards">
              <div className="stat-card">
                <div className="stat-value">{fmt(data.totalViews)}</div>
                <div className="stat-label">Total Views</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmt(data.totalUniqueVisitors)}</div>
                <div className="stat-label">Unique Visitors</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmt(data.totalClicks)}</div>
                <div className="stat-label">Link Clicks</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {data.totalViews > 0 ? ((data.totalClicks / data.totalViews) * 100).toFixed(1) : '0.0'}%
                </div>
                <div className="stat-label">CTR</div>
              </div>
            </div>

            <section className="chart-section">
              <h2>Views Over Time</h2>
              {data.viewsOverTime.length === 0 ? (
                <div className="empty-state"><p>No views in this period.</p></div>
              ) : (
                <div className="chart-container">
                  <svg viewBox="0 0 600 220" className="chart-svg" preserveAspectRatio="xMidYMid meet">
                    {renderChart(data.viewsOverTime)}
                  </svg>
                </div>
              )}
            </section>

            <section className="table-section">
              <h2>Top Lists</h2>
              {data.topLists.length === 0 ? (
                <div className="empty-state"><p>No list activity yet.</p></div>
              ) : (
                <table>
                  <thead>
                    <tr><th>List</th><th className="th-right">Views</th><th className="th-right">Visitors</th><th className="th-right">Clicks</th></tr>
                  </thead>
                  <tbody>
                    {data.topLists.map((list) => (
                      <tr key={list.listId}>
                        <td>
                          <Link href={`/app/analytics/${list.listId}`} className="list-link">
                            /{list.slug}
                          </Link>
                          {list.description && <span className="list-desc">{list.description}</span>}
                        </td>
                        <td className="mono">{fmt(list.totalViews)}</td>
                        <td className="mono">{fmt(list.uniqueVisitors)}</td>
                        <td className="mono">{fmt(list.totalClicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        ) : null}
      </main>
      <style jsx>{`
        .page { max-width: 860px; margin: 0 auto; padding: 28px 16px 48px; }
        .analytics-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .page-title { font-size: 20px; font-weight: 600; margin: 0; }
        .range-toggle {
          display: flex;
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 6px;
          padding: 2px;
        }
        .range-toggle button {
          font-family: var(--font-mono);
          font-size: 12px;
          padding: 4px 10px;
          border: 0;
          border-radius: 4px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }
        .range-toggle button.active {
          background: var(--bg);
          color: var(--text);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .overview-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        @media (max-width: 640px) {
          .overview-cards { grid-template-columns: repeat(2, 1fr); }
        }
        .stat-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          text-align: center;
        }
        .stat-value { font-size: 28px; font-weight: 700; color: var(--text); line-height: 1.2; }
        .stat-label { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .chart-section { margin-bottom: 24px; }
        .chart-section h2, .table-section h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
        .chart-container {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
        }
        .chart-svg { width: 100%; height: auto; }
        .table-section {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
        }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th {
          text-align: left;
          font-weight: 500;
          color: var(--text-muted);
          padding: 6px 8px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        th.th-right { text-align: right; }
        td { padding: 8px; border-bottom: 1px solid var(--border); color: var(--text); }
        tr:last-child td { border-bottom: 0; }
        .mono { font-family: var(--font-mono); text-align: right; }
        .list-link {
          display: block;
          font-family: var(--font-mono);
          font-weight: 500;
          font-size: 14px;
          color: var(--link);
          text-decoration: none;
        }
        .list-link:hover { text-decoration: underline; }
        .list-desc {
          display: block;
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .empty-state { padding: 32px 0; text-align: center; }
        .empty-state p { font-family: var(--font-mono); font-size: 14px; color: var(--text-muted); }
        .loading-skeleton { display: grid; gap: 12px; }
        .skeleton { border-radius: 8px; background: var(--bg-secondary); }
        .skeleton-card { height: 80px; }
      `}</style>
      <style jsx>{skeletonStyles}</style>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function renderChart(dailyViews: { date: string; views: number; uniqueVisitors: number }[]) {
  const maxViews = Math.max(...dailyViews.map((d) => d.views), 1);
  const width = 580;
  const height = 170;
  const left = 20;
  const bottom = 190;

  const elements: React.ReactNode[] = [];
  const step = dailyViews.length > 1 ? width / (dailyViews.length - 1) : width;

  const points = dailyViews.map((d, i) => ({
    x: left + (dailyViews.length > 1 ? i * step : width / 2),
    y: bottom - (d.views / maxViews) * height,
  }));

  const areaPath = points
    .map((p, i) => (i === 0 ? `M ${p.x},${bottom} L ${p.x},${p.y}` : `L ${p.x},${p.y}`))
    .join(' ') + ` L ${points[points.length - 1].x},${bottom} Z`;

  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ');

  elements.push(
    <path key="area" d={areaPath} fill="var(--accent)" opacity="0.1" />,
    <path key="line" d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" />,
  );

  points.forEach((p, i) => {
    if (dailyViews.length <= 30 || i % Math.ceil(dailyViews.length / 15) === 0) {
      elements.push(<circle key={`dot-${i}`} cx={p.x} cy={p.y} r="3" fill="var(--accent)" />);
    }
    if (dailyViews.length <= 14 || i === 0 || i === dailyViews.length - 1 || i % Math.ceil(dailyViews.length / 7) === 0) {
      elements.push(
        <text key={`label-${i}`} x={p.x} y={bottom + 12} textAnchor="middle" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono)">
          {dailyViews[i].date.slice(5)}
        </text>,
      );
    }
  });

  for (let i = 0; i <= 4; i++) {
    const y = bottom - (i / 4) * height;
    const val = Math.round((i / 4) * maxViews);
    elements.push(
      <line key={`grid-${i}`} x1={left} y1={y} x2={left + width} y2={y} stroke="var(--border)" strokeWidth="0.5" />,
      <text key={`ylabel-${i}`} x={left - 4} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono)">
        {fmt(val)}
      </text>,
    );
  }

  return elements;
}

const skeletonStyles = `
  .page { max-width: 860px; margin: 0 auto; padding: 28px 16px 48px; }
  .loading-skeleton { display: grid; gap: 10px; }
  .skeleton { border-radius: 8px; background: var(--bg-secondary); }
  .skeleton-title { height: 26px; width: 140px; }
`;
