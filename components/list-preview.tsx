'use client';

import { useMemo, useState } from 'react';
import {
  getBrandStyleVars,
  getPublicListDescription,
  getPublicListTitle,
  getSocialTitle,
} from '@/lib/list-branding';
import type { DraftBranding, DraftLink } from '@/lib/types';

interface ListPreviewProps {
  slug: string;
  description: string;
  branding: DraftBranding;
  links: DraftLink[];
}

type PreviewMode = 'desktop' | 'mobile' | 'social';

function PreviewModeButton({
  current,
  mode,
  label,
  onClick,
}: {
  current: PreviewMode;
  mode: PreviewMode;
  label: string;
  onClick: (mode: PreviewMode) => void;
}) {
  const active = current === mode;
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      aria-pressed={active}
      onClick={() => onClick(mode)}
      style={
        active
          ? {
              background: 'var(--list-accent)',
              borderColor: 'var(--list-accent)',
              color: 'var(--list-accent-fg)',
            }
          : undefined
      }
    >
      {label}
    </button>
  );
}

export function ListPreview({
  slug,
  description,
  branding,
  links,
}: ListPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('desktop');
  const publicTitle = getPublicListTitle(slug || 'your-list', {
    publicTitle: branding.publicTitle || null,
  });
  const socialTitle = getSocialTitle(slug || 'your-list', {
    publicTitle: branding.publicTitle || null,
    socialTitle: branding.socialTitle || null,
  });
  const socialDescription = getPublicListDescription(
    description,
    links.length || 1,
    {
      socialDescription: branding.socialDescription || null,
    },
  );
  const styleVars = useMemo(
    () => getBrandStyleVars(branding.appearance),
    [branding.appearance],
  );
  const sampleLinks = links.slice(0, 3);
  const frameWidth = mode === 'mobile' ? 360 : 640;
  const slugLabel = slug || 'your-list';

  return (
    <section
      aria-labelledby="preview-heading"
      className="compose-meta-panel"
      style={{ ...styleVars, marginBottom: 16 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 id="preview-heading" style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            Preview
          </h2>
          <p className="small muted">Desktop, mobile, and share-card previews update as you edit.</p>
        </div>
        <div
          role="group"
          aria-label="Preview mode"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <PreviewModeButton current={mode} mode="desktop" label="Desktop" onClick={setMode} />
          <PreviewModeButton current={mode} mode="mobile" label="Mobile" onClick={setMode} />
          <PreviewModeButton current={mode} mode="social" label="Social card" onClick={setMode} />
        </div>
      </div>

      {mode === 'social' ? (
        <div
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid var(--list-hero-border)',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              aspectRatio: '1200 / 630',
              background: branding.socialImageUrl || branding.coverImageUrl
                ? `center / cover no-repeat url("${branding.socialImageUrl || branding.coverImageUrl}")`
                : 'var(--list-hero-gradient)',
              position: 'relative',
            }}
          >
            {!(branding.socialImageUrl || branding.coverImageUrl) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 32,
                  color: 'var(--list-hero-text)',
                }}
              >
                <div
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'var(--list-accent-soft)',
                    color: 'var(--list-hero-text)',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  urlist
                </div>
                <div>
                  <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05, marginBottom: 12 }}>
                    {socialTitle}
                  </div>
                  <div style={{ fontSize: 24, lineHeight: 1.35, color: 'var(--list-hero-muted)' }}>
                    {socialDescription}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{socialTitle}</div>
            <div className="small muted" style={{ marginBottom: 6 }}>{socialDescription}</div>
            <div className="xsmall mono muted">urlist.app/{slugLabel}</div>
          </div>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            maxWidth: frameWidth,
            margin: '0 auto',
            borderRadius: 20,
            border: '1px solid var(--list-hero-border)',
            overflow: 'hidden',
            background: 'var(--list-page-gradient)',
            boxShadow: '0 14px 36px rgba(15, 23, 42, 0.10)',
          }}
        >
          {(branding.coverImageUrl || branding.appearance.theme !== 'default') && (
            <div
              style={{
                aspectRatio: '16 / 6',
                background: branding.coverImageUrl
                  ? `center / cover no-repeat url("${branding.coverImageUrl}")`
                  : 'var(--list-hero-gradient)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0.55) 100%)',
                }}
              />
            </div>
          )}

          <div style={{ padding: mode === 'mobile' ? 20 : 24 }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: mode === 'mobile' ? 13 : 14, color: 'var(--text-muted)', marginBottom: 6 }}>
                /{slugLabel}
              </div>
              <div style={{ fontSize: mode === 'mobile' ? 26 : 32, lineHeight: 1.1, fontWeight: 700, color: 'var(--text)' }}>
                {publicTitle}
              </div>
              {description && (
                <p style={{ marginTop: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {description}
                </p>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gap: 10,
              }}
            >
              {(sampleLinks.length ? sampleLinks : [{ id: 'preview', url: 'https://example.com', ogTitle: 'Preview link', ogDescription: 'This is how your collection will look to visitors.' }]).map((link, index) => (
                <div
                  key={link.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: branding.appearance.layout === 'cards' ? '1fr' : '80px 1fr',
                    gap: 12,
                    borderRadius: 14,
                    border: '1px solid var(--list-hero-border)',
                    background: 'var(--surface)',
                    padding: 12,
                  }}
                >
                  <div
                    style={{
                      minHeight: branding.appearance.layout === 'cards' ? 120 : 80,
                      borderRadius: 12,
                      background: branding.coverImageUrl
                        ? `center / cover no-repeat url("${branding.coverImageUrl}")`
                        : 'var(--list-hero-gradient)',
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {'ogTitle' in link && link.ogTitle ? link.ogTitle : `Link ${index + 1}`}
                    </div>
                    <div className="xsmall mono muted" style={{ marginBottom: 6 }}>
                      {'url' in link ? new URL(link.url).hostname : 'example.com'}
                    </div>
                    <div className="small muted">
                      {'ogDescription' in link && link.ogDescription
                        ? link.ogDescription
                        : 'Short preview text for each saved link appears here.'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
