'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { LinkCard } from '@/components/link-card';
import { NavHeader } from '@/components/nav-header';
import type { ListWithLinks, TrackEventPayload } from '@/lib/types';

const QRCodeSVG = dynamic(
  () => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })),
  { ssr: false },
);

interface PublicListClientProps {
  list: ListWithLinks;
  slug: string;
  justPublished: boolean;
}

function trackEvent(listId: string, payload: TrackEventPayload) {
  fetch(`/api/lists/${listId}/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Analytics should never break the user experience
  });
}

export function PublicListClient({ list, slug, justPublished }: PublicListClientProps) {
  const [showBanner, setShowBanner] = useState(justPublished);
  const [view, setView] = useState<'list' | 'qr'>('list');
  // null until mounted — avoids encoding a relative URL into the QR code
  const [publicUrl, setPublicUrl] = useState<string | null>(null);

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/${slug}`);
  }, [slug]);

  // Track page view on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    trackEvent(list.listId, {
      type: 'pageView',
      referrer: document.referrer || undefined,
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
    });
  }, [list.listId]);

  // Auto-dismiss banner after 30 seconds
  useEffect(() => {
    if (showBanner) {
      const timer = setTimeout(() => setShowBanner(false), 30000);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  const handleLinkClick = useCallback(
    (linkId: string) => {
      trackEvent(list.listId, {
        type: 'linkClick',
        linkId,
        referrer: document.referrer || undefined,
      });
    },
    [list.listId],
  );

  return (
    <div>
      <NavHeader />

      {showBanner && (
        <div className="page">
          <div className="pub-banner">
            <span className="pub-banner-label">Published —</span>
            <span className="pub-banner-url">{(publicUrl ?? `/${slug}`).replace(/^https?:\/\//, '')}</span>
          </div>
        </div>
      )}

      <main className="page">
        <div className="pub-header">
          <div>
            <div className="pub-title">/{slug}</div>
            {list.description && <div className="pub-desc">{list.description}</div>}
            <div className="pub-meta">
              {list.links.length} link{list.links.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              aria-pressed={view === 'list'}
              className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
              onClick={() => setView('list')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              List
            </button>
            <button
              aria-pressed={view === 'qr'}
              className={`view-toggle-btn${view === 'qr' ? ' active' : ''}`}
              onClick={() => setView('qr')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="3" height="3" />
                <line x1="14" y1="20" x2="21" y2="20" />
                <line x1="21" y1="14" x2="21" y2="17" />
              </svg>
              QR
            </button>
          </div>
        </div>

        <hr className="divider" />

        {view === 'list' ? (
          <div className="pub-links" role="tabpanel" aria-label="Link list">
            {[...list.links].sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false)).map((link) => (
              <div key={link.id} onClick={() => handleLinkClick(link.id)}>
                <LinkCard link={link} isPublicView />
              </div>
            ))}
          </div>
        ) : (
          <div className="qr-view">
            {publicUrl ? (
              <>
                <div className="qr-card">
                  <QRCodeSVG
                    value={publicUrl}
                    size={Math.min(256, typeof window !== 'undefined' ? window.innerWidth - 80 : 256)}
                    marginSize={2}
                    title={`QR code for ${publicUrl}`}
                  />
                </div>
                <p className="qr-instructions">Scan with your phone&apos;s camera to open this list</p>
                <p className="qr-url">{publicUrl}</p>
              </>
            ) : (
              <div className="qr-loading" aria-label="Loading QR code" />
            )}
          </div>
        )}
      </main>

      <style jsx>{`
        .page {
          max-width: 860px;
          margin: 0 auto;
          padding: 28px 16px 48px;
        }

        .pub-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }

        .pub-banner {
          background: var(--blue-bg);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid var(--surface-border);
          border-radius: var(--radius);
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          margin-bottom: 16px;
        }

        .pub-banner-label {
          color: var(--accent);
          font-weight: 500;
          flex-shrink: 0;
        }

        .pub-banner-url {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .pub-banner :global(.btn) {
          flex-shrink: 0;
        }

        .pub-title {
          font-family: var(--font-mono);
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 4px;
          color: var(--text);
        }

        .pub-desc {
          font-size: 16px;
          color: var(--text-muted);
          margin-bottom: 6px;
          line-height: 1.45;
        }

        .pub-meta {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--text-muted);
        }

        .view-toggle {
          display: inline-flex;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          flex-shrink: 0;
          margin-top: 4px;
        }

        .view-toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 500;
          font-family: var(--font-body);
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          transition: background 0.15s, color 0.15s;
          line-height: 1;
        }

        .view-toggle-btn + .view-toggle-btn {
          border-left: 1px solid var(--border);
        }

        .view-toggle-btn.active {
          background: var(--accent);
          color: #fff;
        }

        .view-toggle-btn:not(.active):hover {
          background: var(--bg-secondary);
          color: var(--text);
        }

        .pub-links {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .qr-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 32px 0 16px;
          gap: 16px;
        }

        .qr-card {
          background: #fff;
          border-radius: var(--radius);
          padding: 20px;
          border: 1px solid var(--border);
          line-height: 0;
        }

        .qr-instructions {
          font-size: 14px;
          color: var(--text-muted);
          margin: 0;
        }

        .qr-url {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
          word-break: break-all;
          text-align: center;
        }

        .qr-loading {
          width: 256px;
          height: 256px;
          border-radius: var(--radius);
          background: var(--border);
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
