'use client';

import { useState, useRef, useEffect } from 'react';
import type { DraftLink, LinkWithId } from '@/lib/types';
import { LinkCardPlaceholder } from './link-card-placeholder';

interface LinkCardProps {
  link: DraftLink | LinkWithId;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<DraftLink>) => void;
  onPin?: (id: string) => void;
  onRecheck?: (id: string) => void;
  onDismissHealth?: (id: string) => void;
  healthActionId?: string | null;
  isPublicView?: boolean;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatHealthDate(value?: number | null): string {
  if (!value) return 'Never checked';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function healthLabel(link: DraftLink | LinkWithId): {
  label: string;
  detail: string;
  className: string;
  attention: boolean;
} {
  const status = link.healthStatus ?? 'unchecked';
  const finalUrl = link.healthFinalUrl && link.healthFinalUrl !== link.url ? ` → ${getHostname(link.healthFinalUrl)}` : '';
  if (status === 'healthy') return { label: 'Healthy', detail: `Checked ${formatHealthDate(link.healthCheckedAt)}`, className: 'health-ok', attention: false };
  if (status === 'redirected') return { label: 'Redirected', detail: `Destination redirects${finalUrl}`, className: 'health-warn', attention: true };
  if (status === 'transient') return { label: 'Possibly broken', detail: `Temporary failure: ${link.healthReason ?? 'unknown'}`, className: 'health-warn', attention: true };
  if (status === 'broken') return { label: 'Broken', detail: `Failure: ${link.healthReason ?? 'unknown'}`, className: 'health-bad', attention: true };
  if (status === 'dismissed') return { label: 'Dismissed', detail: `Hidden until next check`, className: 'health-muted', attention: false };
  return { label: 'Unchecked', detail: 'Run a link check to verify this destination.', className: 'health-muted', attention: false };
}

export function LinkCard({
  link,
  onDelete,
  onUpdate,
  onPin,
  onRecheck,
  onDismissHealth,
  healthActionId,
  isPublicView = false,
}: LinkCardProps) {
  const [imgError, setImgError] = useState(false);
  const [editingField, setEditingField] = useState<'title' | 'description' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const hostname = getHostname(link.url);
  const title = link.ogTitle || hostname;
  const description = link.ogDescription;
  const isLoading = 'ogLoading' in link && link.ogLoading;
  const isPinned = link.pinned ?? false;
  const health = healthLabel(link);
  const healthBusy = healthActionId === link.id;

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const startEditing = (field: 'title' | 'description') => {
    if (!onUpdate) return;
    setEditingField(field);
    setEditValue(field === 'title' ? (link.ogTitle || '') : (link.ogDescription || ''));
  };

  const commitEdit = () => {
    if (!editingField || !onUpdate) return;
    if (editingField === 'title') {
      onUpdate(link.id, { ogTitle: editValue || null, ogTitleUserEdited: true });
    } else {
      onUpdate(link.id, { ogDescription: editValue || null, ogDescriptionUserEdited: true });
    }
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
  };

  if (isPublicView) {
    return (
      <div className={isPinned ? 'pub-card pub-card--pinned' : 'pub-card'}>
        <div className="pub-card-img">
          {link.ogImage && !imgError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={link.ogImage} alt="" onError={() => setImgError(true)} loading="lazy" />
          ) : (
            <LinkCardPlaceholder />
          )}
        </div>
        <div className="pub-card-body">
          <div className="pub-card-title">
            <a href={link.url} target="_blank" rel="noopener noreferrer">{title}</a>
          </div>
          <div className="pub-card-domain">{hostname}</div>
          {description && <div className="pub-card-desc">{description}</div>}
        </div>
        {isPinned && (
          <svg className="pub-card-pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-label="Pinned">
            <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <div className="pub-card" style={{ position: 'relative', overflow: 'hidden' }}>
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'var(--border)',
            overflow: 'hidden',
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: '40%',
              height: '100%',
              background: 'var(--accent)',
              borderRadius: '2px',
              animation: 'og-loading-slide 1.2s ease-in-out infinite',
            }}
          />
        </div>
      )}
      <div className="pub-card-img">
        {link.ogImage && !imgError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={link.ogImage} alt="" onError={() => setImgError(true)} loading="lazy" />
        ) : (
          <LinkCardPlaceholder />
        )}
      </div>
      <div className="pub-card-body">
        {editingField === 'title' ? (
          <input
            ref={inputRef}
            className="pub-card-title"
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 4px', font: 'inherit', color: 'inherit' }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          />
        ) : (
          <div
            className="pub-card-title"
            onClick={() => startEditing('title')}
            style={onUpdate ? { cursor: 'text' } : undefined}
            title={onUpdate ? 'Click to edit title' : undefined}
          >{title}</div>
        )}
        <div className="pub-card-domain">{hostname}</div>
        {editingField === 'description' ? (
          <input
            ref={inputRef}
            className="pub-card-desc"
            style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 4px', font: 'inherit', color: 'inherit' }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          />
        ) : (
          <div
            className="pub-card-desc"
            onClick={() => startEditing('description')}
            style={onUpdate ? { cursor: 'text' } : undefined}
            title={onUpdate ? 'Click to edit description' : undefined}
          >{description || (onUpdate ? 'Add a description…' : '')}</div>
        )}
        {(onRecheck || link.healthStatus) && (
          <div className="link-health">
            <span className={`health-pill ${health.className}`}>{health.label}</span>
            <span className="health-detail">{health.detail}</span>
            {link.metadataRefreshStatus === 'updated' && (
              <span className="health-detail">Preview refreshed</span>
            )}
            {onRecheck && (
              <button
                type="button"
                className="health-action"
                disabled={healthBusy}
                onClick={() => onRecheck(link.id)}
              >
                {healthBusy ? 'Checking…' : 'Recheck + refresh preview'}
              </button>
            )}
            {onDismissHealth && health.attention && (
              <button
                type="button"
                className="health-action"
                disabled={healthBusy}
                onClick={() => onDismissHealth(link.id)}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
      {onPin && (
        <button
          onClick={() => onPin(link.id)}
          title={isPinned ? 'Unpin' : 'Pin to top'}
          style={{
            alignSelf: 'start',
            margin: '10px 0 0 0',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            color: isPinned ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
          }}
          aria-label={isPinned ? 'Unpin link' : 'Pin link to top'}
          aria-pressed={isPinned}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
          </svg>
        </button>
      )}
      {onDelete && (
        <button
          onClick={() => onDelete(link.id)}
          className="remove-btn"
          title="Remove"
          style={{ alignSelf: 'start', margin: '10px 8px 0 0' }}
        >
          ×
        </button>
      )}
      <style jsx>{`
        @keyframes og-loading-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(150%); }
        }
        .link-health {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          font-size: 11px;
        }
        .health-pill {
          border-radius: 999px;
          padding: 2px 7px;
          font-family: var(--font-mono);
        }
        .health-ok {
          background: rgba(34, 197, 94, 0.12);
          color: #16803a;
        }
        .health-warn {
          background: rgba(245, 158, 11, 0.14);
          color: #a15c00;
        }
        .health-bad {
          background: rgba(239, 68, 68, 0.13);
          color: var(--danger);
        }
        .health-muted {
          background: var(--bg-secondary);
          color: var(--text-muted);
        }
        .health-detail {
          color: var(--text-muted);
        }
        .health-action {
          border: none;
          background: var(--bg-secondary);
          color: var(--text);
          border-radius: 999px;
          padding: 2px 7px;
          cursor: pointer;
          font-size: 11px;
        }
        .health-action:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
