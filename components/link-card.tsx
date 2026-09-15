'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { DraftLink, LinkWithId } from '@/lib/types';
import {
  DEFAULT_VISIBLE_TIMEZONE,
  getLinkScheduleError,
  getLinkVisibilityStatus,
  hasVisibilitySchedule,
  isValidTimeZone,
} from '@/lib/scheduling';
import { LinkCardPlaceholder } from './link-card-placeholder';

interface LinkCardProps {
  link: DraftLink | LinkWithId;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<DraftLink>) => void;
  onPin?: (id: string) => void;
  isPublicView?: boolean;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_VISIBLE_TIMEZONE;
}

function getTimeZoneOptions(selectedTimeZone: string): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [
        'UTC',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/New_York',
        'Europe/London',
        'Europe/Paris',
        'Asia/Tokyo',
      ];

  return Array.from(new Set([selectedTimeZone, getLocalTimeZone(), DEFAULT_VISIBLE_TIMEZONE, ...supported]))
    .filter(isValidTimeZone);
}

function getTimeZoneParts(timestamp: number, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
}

function formatDateTimeLocalInTimeZone(timestamp: number | null, timeZone: string): string {
  if (timestamp == null || !isValidTimeZone(timeZone)) return '';
  const parts = getTimeZoneParts(timestamp, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function getTimeZoneOffsetMs(timestamp: number, timeZone: string): number {
  const parts = getTimeZoneParts(timestamp, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - timestamp;
}

function dateTimeLocalToUtcMs(value: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !isValidTimeZone(timeZone)) return null;

  const [, year, month, day, hour, minute] = match;
  const wallTimeAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  let utc = wallTimeAsUtc;
  for (let i = 0; i < 3; i++) {
    utc = wallTimeAsUtc - getTimeZoneOffsetMs(utc, timeZone);
  }
  return utc;
}

function formatScheduleTimestamp(timestamp: number | null, timeZone: string): string | null {
  if (timestamp == null || !isValidTimeZone(timeZone)) return null;
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export function LinkCard({ link, onDelete, onUpdate, onPin, isPublicView = false }: LinkCardProps) {
  const [imgError, setImgError] = useState(false);
  const [editingField, setEditingField] = useState<'title' | 'description' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const hostname = getHostname(link.url);
  const title = link.ogTitle || hostname;
  const description = link.ogDescription;
  const isLoading = 'ogLoading' in link && link.ogLoading;
  const isPinned = link.pinned ?? false;
  const selectedTimeZone = link.visibleTimezone || getLocalTimeZone();
  const timeZoneOptions = useMemo(() => getTimeZoneOptions(selectedTimeZone), [selectedTimeZone]);
  const visibilityStatus = getLinkVisibilityStatus(link);
  const scheduleError = getLinkScheduleError(link);
  const scheduleSummary = [
    formatScheduleTimestamp(link.visibleFrom, selectedTimeZone)
      ? `From ${formatScheduleTimestamp(link.visibleFrom, selectedTimeZone)}`
      : null,
    formatScheduleTimestamp(link.visibleUntil, selectedTimeZone)
      ? `Until ${formatScheduleTimestamp(link.visibleUntil, selectedTimeZone)}`
      : null,
  ].filter(Boolean).join(' · ');

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

  const updateScheduleDate = (field: 'visibleFrom' | 'visibleUntil', value: string) => {
    if (!onUpdate) return;
    const timestamp = value ? dateTimeLocalToUtcMs(value, selectedTimeZone) : null;
    const otherTimestamp = field === 'visibleFrom' ? link.visibleUntil : link.visibleFrom;
    const visibleTimezone = timestamp != null || otherTimestamp != null ? selectedTimeZone : null;
    onUpdate(
      link.id,
      field === 'visibleFrom'
        ? { visibleFrom: timestamp, visibleTimezone }
        : { visibleUntil: timestamp, visibleTimezone },
    );
  };

  const updateScheduleTimeZone = (timeZone: string) => {
    if (!onUpdate) return;
    const currentFrom = formatDateTimeLocalInTimeZone(link.visibleFrom, selectedTimeZone);
    const currentUntil = formatDateTimeLocalInTimeZone(link.visibleUntil, selectedTimeZone);
    const visibleFrom = currentFrom ? dateTimeLocalToUtcMs(currentFrom, timeZone) : null;
    const visibleUntil = currentUntil ? dateTimeLocalToUtcMs(currentUntil, timeZone) : null;
    onUpdate(link.id, {
      visibleFrom,
      visibleUntil,
      visibleTimezone: visibleFrom != null || visibleUntil != null ? timeZone : null,
    });
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
    <div
      className={[
        'pub-card',
        'edit-card',
        isPinned ? 'pub-card--pinned' : '',
        `edit-card--${visibilityStatus}`,
      ].filter(Boolean).join(' ')}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
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
        {onUpdate && (
          <div className="schedule-panel">
            <div className="schedule-head">
              <span className={`schedule-status schedule-status--${visibilityStatus}`}>
                {visibilityStatus}
              </span>
              <span className="schedule-note">
                {scheduleSummary || 'Always visible'}
              </span>
            </div>
            <div className="schedule-grid">
              <label>
                <span>Visible from</span>
                <input
                  className="input input-sm"
                  type="datetime-local"
                  value={formatDateTimeLocalInTimeZone(link.visibleFrom, selectedTimeZone)}
                  onChange={(e) => updateScheduleDate('visibleFrom', e.target.value)}
                />
              </label>
              <label>
                <span>Visible until</span>
                <input
                  className="input input-sm"
                  type="datetime-local"
                  value={formatDateTimeLocalInTimeZone(link.visibleUntil, selectedTimeZone)}
                  onChange={(e) => updateScheduleDate('visibleUntil', e.target.value)}
                />
              </label>
              <label className="timezone-field">
                <span>Time zone</span>
                <select
                  className="input input-sm"
                  value={selectedTimeZone}
                  onChange={(e) => updateScheduleTimeZone(e.target.value)}
                >
                  {timeZoneOptions.map((timeZone) => (
                    <option key={timeZone} value={timeZone}>{timeZone}</option>
                  ))}
                </select>
              </label>
            </div>
            {scheduleError ? (
              <span className="validation-message schedule-error">{scheduleError}</span>
            ) : (
              hasVisibilitySchedule(link) && (
                <span className="schedule-hint">Starts inclusively; expires at the exact until time.</span>
              )
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
        .edit-card {
          min-height: 92px;
          height: auto;
          align-items: flex-start;
        }
        .edit-card--upcoming {
          border-color: color-mix(in srgb, var(--link) 45%, var(--surface-border));
        }
        .edit-card--expired {
          opacity: 0.72;
          border-color: color-mix(in srgb, var(--danger) 35%, var(--surface-border));
        }
        @keyframes og-loading-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(150%); }
        }
        .schedule-panel {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }
        .schedule-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          min-width: 0;
        }
        .schedule-status {
          border-radius: 999px;
          font-family: var(--font-mono);
          font-size: 0.6875rem;
          font-weight: 600;
          line-height: 1;
          padding: 4px 7px;
          text-transform: uppercase;
        }
        .schedule-status--active {
          background: color-mix(in srgb, var(--success) 12%, transparent);
          color: var(--success);
        }
        .schedule-status--upcoming {
          background: color-mix(in srgb, var(--link) 12%, transparent);
          color: var(--link);
        }
        .schedule-status--expired {
          background: rgba(220, 38, 38, 0.1);
          color: var(--danger);
        }
        .schedule-note {
          color: var(--text-muted);
          font-family: var(--font-mono);
          font-size: 0.75rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .schedule-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(140px, 0.9fr);
          gap: 8px;
        }
        .schedule-grid label {
          color: var(--text-muted);
          display: grid;
          font-size: 0.75rem;
          gap: 3px;
        }
        .schedule-grid :global(.input) {
          font-size: 0.8125rem;
          min-width: 0;
        }
        .schedule-error {
          margin-top: 5px;
        }
        .schedule-hint {
          color: var(--text-muted);
          display: block;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          margin-top: 5px;
        }
        @media (max-width: 720px) {
          .schedule-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
