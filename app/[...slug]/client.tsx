'use client';

import { useEffect, useState, useCallback } from 'react';
import { LinkCard } from '@/components/link-card';
import { NavHeader } from '@/components/nav-header';
import type { ListWithLinks, TrackEventPayload } from '@/lib/types';

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
  const [copied, setCopied] = useState(false);

  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/${slug}` : `/${slug}`;

  // Store in recent publishes localStorage
  useEffect(() => {
    if (justPublished && typeof window !== 'undefined') {
      try {
        const key = 'urlist-recent-publishes';
        const existing = JSON.parse(localStorage.getItem(key) || '[]') as string[];
        const updated = [publicUrl, ...existing.filter((u) => u !== publicUrl)].slice(0, 10);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  }, [justPublished, publicUrl]);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

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
            <span className="pub-banner-url">{publicUrl.replace(/^https?:\/\//, '')}</span>
            <button
              onClick={handleCopy}
              className="btn btn-outline"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <main className="page">
        <div className="pub-title">/{slug}</div>
        {list.description && <div className="pub-desc">{list.description}</div>}
        <div className="pub-meta">
          {list.links.length} link{list.links.length !== 1 ? 's' : ''}
        </div>
        <hr className="divider" />

        <div className="pub-links">
          {list.links.map((link) => (
            <div key={link.id} onClick={() => handleLinkClick(link.id)}>
              <LinkCard link={link} isPublicView />
            </div>
          ))}
        </div>
      </main>

      <style jsx>{`
        .page {
          max-width: 860px;
          margin: 0 auto;
          padding: 28px 16px 48px;
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
          margin-bottom: 12px;
        }

        .pub-links {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
      `}</style>
    </div>
  );
}
