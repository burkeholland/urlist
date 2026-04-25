'use client';

import { useState, useRef, useEffect } from 'react';
import type { DraftLink, LinkWithId } from '@/lib/types';
import { LinkCardPlaceholder } from './link-card-placeholder';

interface LinkCardProps {
  link: DraftLink | LinkWithId;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<DraftLink>) => void;
  isPublicView?: boolean;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function LinkCard({ link, onDelete, onUpdate, isPublicView = false }: LinkCardProps) {
  const [imgError, setImgError] = useState(false);
  const [editingField, setEditingField] = useState<'title' | 'description' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const hostname = getHostname(link.url);
  const title = link.ogTitle || hostname;
  const description = link.ogDescription;
  const isLoading = 'ogLoading' in link && link.ogLoading;

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
    const key = editingField === 'title' ? 'ogTitle' : 'ogDescription';
    onUpdate(link.id, { [key]: editValue || null });
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
  };

  if (isPublicView) {
    return (
      <div className="pub-card">
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
      </div>
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
      `}</style>
    </div>
  );
}
