'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { LinkCard } from '@/components/link-card';
import { NavHeader } from '@/components/nav-header';
import {
  buildEmbedUrl,
  createEmbedCode,
  EMBED_RESIZE_MESSAGE_TYPE,
  estimateEmbedHeight,
  getAdjacentPublicListViewMode,
  PUBLIC_LIST_VIEW_MODES,
} from '@/lib/embed';
import { copyText, legacyCopyToClipboard, shareContent, supportsWebShare } from '@/lib/share';
import type { EmbedTheme, PublicListViewMode, PublicRenderOptions } from '@/lib/embed';
import type { ListWithLinks, TrackEventPayload } from '@/lib/types';

const QRCodeSVG = dynamic(
  () => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })),
  { ssr: false },
);

const LIGHT_EMBED_THEME = {
  '--bg': '#f8fcff',
  '--bg-gradient': 'linear-gradient(to bottom right, #ffffff, #f0f9ff, #f6fff8)',
  '--bg-secondary': 'rgba(255, 255, 255, 0.7)',
  '--surface': 'rgba(255, 255, 255, 0.92)',
  '--surface-border': 'rgba(255, 255, 255, 0.72)',
  '--accent': '#ff7f50',
  '--accent-hover': '#e86f43',
  '--link': '#0ea5e9',
  '--link-hover': '#0284c7',
  '--border': '#e0e4e8',
  '--input-border': '#c0c6ce',
  '--text': '#111827',
  '--text-muted': '#6b7280',
  '--mono-bg': 'rgba(255, 255, 255, 0.5)',
  '--blue-bg': 'rgba(255, 127, 80, 0.08)',
  '--danger': '#dc2626',
  '--danger-hover': '#b91c1c',
  '--success': '#16a34a',
} as React.CSSProperties;

const DARK_EMBED_THEME = {
  '--bg': '#0f1117',
  '--bg-gradient': 'linear-gradient(to bottom right, #0f1117, #121520, #101318)',
  '--bg-secondary': 'rgba(30, 33, 43, 0.76)',
  '--surface': 'rgba(30, 33, 43, 0.92)',
  '--surface-border': 'rgba(55, 60, 75, 0.7)',
  '--accent': '#ff9068',
  '--accent-hover': '#ffab8a',
  '--link': '#38bdf8',
  '--link-hover': '#7dd3fc',
  '--border': '#2a2e3a',
  '--input-border': '#3a3f4e',
  '--text': '#e5e7eb',
  '--text-muted': '#9ca3af',
  '--mono-bg': 'rgba(30, 33, 43, 0.5)',
  '--blue-bg': 'rgba(255, 144, 104, 0.08)',
  '--danger': '#ef4444',
  '--danger-hover': '#f87171',
  '--success': '#22c55e',
} as React.CSSProperties;

interface PublicListClientProps {
  list: ListWithLinks;
  slug: string;
  justPublished: boolean;
  renderOptions: PublicRenderOptions;
}

function trackEvent(listId: string, payload: TrackEventPayload) {
  fetch(`/api/lists/${listId}/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Analytics should never break the user experience
  });
}

function icon(type: 'link' | 'share' | 'code' | 'list' | 'qr' | 'embed') {
  switch (type) {
    case 'link':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 0 0-7.07-7.07L11 4" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3.54 3.54a5 5 0 1 0 7.07 7.07L13 20" />
        </svg>
      );
    case 'share':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      );
    case 'code':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case 'list':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
    case 'qr':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="3" height="3" />
          <line x1="14" y1="20" x2="21" y2="20" />
          <line x1="21" y1="14" x2="21" y2="17" />
        </svg>
      );
    case 'embed':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m18 16 4-4-4-4" />
          <path d="m6 8-4 4 4 4" />
          <path d="m14.5 4-5 16" />
        </svg>
      );
  }
}

function getEmbedThemeStyle(theme: EmbedTheme): React.CSSProperties | undefined {
  if (theme === 'light') return LIGHT_EMBED_THEME;
  if (theme === 'dark') return DARK_EMBED_THEME;
  return undefined;
}

export function PublicListClient({
  list,
  slug,
  justPublished,
  renderOptions,
}: PublicListClientProps) {
  const isEmbed = renderOptions.isEmbed;
  const [showBanner, setShowBanner] = useState(justPublished && !isEmbed);
  const [view, setView] = useState<PublicListViewMode>('list');
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [selectedEmbedTheme, setSelectedEmbedTheme] = useState<EmbedTheme>(renderOptions.theme);
  const [previewHeight, setPreviewHeight] = useState(estimateEmbedHeight(list.links.length));
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const viewTabRefs = useRef<Record<PublicListViewMode, HTMLButtonElement | null>>({
    list: null,
    qr: null,
    embed: null,
  });
  const nativeShareSupported = useMemo(() => {
    if (typeof navigator === 'undefined' || !publicUrl) {
      return false;
    }

    return supportsWebShare(navigator, {
      title: `/${slug} — The Urlist`,
      text: list.description || `Check out /${slug} on urlist`,
      url: publicUrl,
    });
  }, [list.description, publicUrl, slug]);

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/${slug}`);
  }, [slug]);

  useEffect(() => {
    if (isEmbed) {
      setView('list');
    }
  }, [isEmbed]);

  useEffect(() => {
    if (isEmbed && renderOptions.theme !== selectedEmbedTheme) {
      setSelectedEmbedTheme(renderOptions.theme);
    }
  }, [isEmbed, renderOptions.theme, selectedEmbedTheme]);

  useEffect(() => {
    if (justPublished && publicUrl && !isEmbed) {
      try {
        const key = 'urlist-recent-publishes';
        const existing = JSON.parse(localStorage.getItem(key) || '[]') as string[];
        const updated = [publicUrl, ...existing.filter((u) => u !== publicUrl)].slice(0, 10);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  }, [isEmbed, justPublished, publicUrl]);

  useEffect(() => {
    if (isEmbed && renderOptions.isPreview) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    trackEvent(list.listId, {
      type: 'pageView',
      surface: isEmbed ? 'embed' : 'page',
      referrer: document.referrer || undefined,
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
    });
  }, [isEmbed, list.listId, renderOptions.isPreview]);

  useEffect(() => {
    if (showBanner) {
      const timer = setTimeout(() => setShowBanner(false), 30000);
      return () => clearTimeout(timer);
    }
  }, [showBanner]);

  useEffect(() => {
    if (!announcement) return;

    const timer = setTimeout(() => setAnnouncement(null), 3000);
    return () => clearTimeout(timer);
  }, [announcement]);

  useEffect(() => {
    if (!isEmbed) {
      return;
    }

    const publishHeight = () => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      window.parent.postMessage({ type: EMBED_RESIZE_MESSAGE_TYPE, height }, '*');
    };

    publishHeight();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => publishHeight())
      : null;

    resizeObserver?.observe(document.body);
    window.addEventListener('load', publishHeight);
    window.addEventListener('resize', publishHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('load', publishHeight);
      window.removeEventListener('resize', publishHeight);
    };
  }, [isEmbed, list.links.length]);

  useEffect(() => {
    if (isEmbed || view !== 'embed' || !publicUrl) {
      return;
    }

    const expectedOrigin = new URL(publicUrl).origin;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      if (event.source !== previewFrameRef.current?.contentWindow) return;
      if (!event.data || event.data.type !== EMBED_RESIZE_MESSAGE_TYPE) return;
      const nextHeight = Number(event.data.height);
      if (Number.isFinite(nextHeight)) {
        setPreviewHeight(Math.min(880, Math.max(320, Math.ceil(nextHeight))));
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isEmbed, publicUrl, view]);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const selectView = useCallback((nextView: PublicListViewMode) => {
    setView(nextView);
  }, []);

  const handleViewTabKeyDown = useCallback((currentView: PublicListViewMode, key: string) => {
    const nextView = getAdjacentPublicListViewMode(currentView, key);
    if (!nextView) {
      return;
    }

    setView(nextView);
    viewTabRefs.current[nextView]?.focus();
  }, []);

  const copyValue = useCallback(async (value: string, successMessage: string) => {
    try {
      await copyText(value, {
        navigatorLike: navigator,
        legacyCopy: (text) => legacyCopyToClipboard(text, document),
      });
      announce(successMessage);
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Copy failed.');
    }
  }, [announce]);

  const shareValue = useCallback(async (data: { title: string; text: string; url: string }, successMessage: string) => {
    try {
      await shareContent(navigator, data);
      announce(successMessage);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      announce(error instanceof Error ? error.message : 'Share failed.');
    }
  }, [announce]);

  const handleLinkClick = useCallback(
    (linkId: string) => {
      if (isEmbed && renderOptions.isPreview) {
        return;
      }

      trackEvent(list.listId, {
        type: 'linkClick',
        surface: isEmbed ? 'embed' : 'page',
        linkId,
        referrer: document.referrer || undefined,
      });
    },
    [isEmbed, list.listId, renderOptions.isPreview],
  );

  const collectionShareData = publicUrl
    ? {
        title: `/${slug} — The Urlist`,
        text: list.description || `Check out /${slug} on urlist`,
        url: publicUrl,
      }
    : null;

  const previewUrl = publicUrl ? buildEmbedUrl(publicUrl, selectedEmbedTheme, { preview: true }) : null;
  const embedCode = publicUrl
    ? createEmbedCode({
        publicUrl,
        slug,
        theme: selectedEmbedTheme,
        initialHeight: estimateEmbedHeight(list.links.length),
      })
    : '';

  const publicCards = [...list.links].sort((a, b) => {
    const pinnedOrder = Number(b.pinned ?? false) - Number(a.pinned ?? false);
    if (pinnedOrder !== 0) {
      return pinnedOrder;
    }
    return a.position - b.position;
  });

  if (isEmbed) {
    return (
      <main
        className="embed-shell"
        style={getEmbedThemeStyle(renderOptions.theme)}
      >
        <div className="embed-header">
          <div>
            <div className="embed-title">/{slug}</div>
            {list.description && <p className="embed-desc">{list.description}</p>}
          </div>
          <div className="embed-meta">
            {list.links.length} link{list.links.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="pub-links" role="list" aria-label="Embedded link list">
          {publicCards.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              isPublicView
              publicMode="embed"
              onPublicLinkClick={handleLinkClick}
            />
          ))}
        </div>

        <style jsx>{`
          .embed-shell {
            min-height: 100vh;
            padding: 18px;
            background: var(--bg-gradient);
          }

          .embed-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin: 0 auto 16px;
            max-width: 760px;
          }

          .embed-title {
            font-family: var(--font-mono);
            font-size: 18px;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 4px;
          }

          .embed-desc {
            margin: 0;
            color: var(--text-muted);
            font-size: 14px;
            line-height: 1.45;
          }

          .embed-meta {
            font-family: var(--font-mono);
            color: var(--text-muted);
            font-size: 13px;
            white-space: nowrap;
            margin-top: 2px;
          }

          .pub-links {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-width: 760px;
            margin: 0 auto;
          }

          @media (max-width: 640px) {
            .embed-shell {
              padding: 14px;
            }

            .embed-header {
              flex-direction: column;
            }
          }
        `}</style>
      </main>
    );
  }

  return (
    <div>
      <NavHeader />

      {showBanner && (
        <div className="page">
          <div className="pub-banner">
            <div className="pub-banner-copy">
              <span className="pub-banner-label">Published —</span>
              <span className="pub-banner-url">{(publicUrl ?? `/${slug}`).replace(/^https?:\/\//, '')}</span>
            </div>
            <div className="pub-banner-actions">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => publicUrl && void copyValue(publicUrl, 'Collection link copied.')}
                disabled={!publicUrl}
              >
                {icon('link')}
                Copy link
              </button>
              {nativeShareSupported && collectionShareData && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => void shareValue(collectionShareData, 'Share sheet opened.')}
                >
                  {icon('share')}
                  Share
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="page">
        <div className="pub-header">
          <div className="pub-header-copy">
            <div className="pub-title">/{slug}</div>
            {list.description && <div className="pub-desc">{list.description}</div>}
            <div className="pub-meta">
              {list.links.length} link{list.links.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="pub-header-tools">
            <div className="share-toolbar" role="group" aria-label="Share collection">
              <button
                className="toolbar-btn"
                onClick={() => publicUrl && void copyValue(publicUrl, 'Collection link copied.')}
                disabled={!publicUrl}
              >
                {icon('link')}
                Copy URL
              </button>
              {nativeShareSupported && collectionShareData && (
                <button
                  className="toolbar-btn"
                  onClick={() => void shareValue(collectionShareData, 'Share sheet opened.')}
                >
                  {icon('share')}
                  Share
                </button>
              )}
            </div>

            <div className="view-toggle" role="tablist" aria-label="View mode">
              {PUBLIC_LIST_VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  id={`view-tab-${mode}`}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  aria-controls={`view-panel-${mode}`}
                  tabIndex={view === mode ? 0 : -1}
                  className={`view-toggle-btn${view === mode ? ' active' : ''}`}
                  onClick={() => selectView(mode)}
                  onKeyDown={(event) => {
                    const nextView = getAdjacentPublicListViewMode(mode, event.key);
                    if (!nextView) {
                      return;
                    }

                    event.preventDefault();
                    handleViewTabKeyDown(mode, event.key);
                  }}
                  ref={(element) => {
                    viewTabRefs.current[mode] = element;
                  }}
                >
                  {icon(mode)}
                  {mode === 'qr' ? 'QR' : mode[0].toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="share-status" aria-live="polite">
          {announcement ?? '\u00a0'}
        </p>

        <hr className="divider" />

        {view === 'list' ? (
          <div
            id="view-panel-list"
            className="pub-links"
            role="tabpanel"
            aria-labelledby="view-tab-list"
          >
            {publicCards.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                isPublicView
                publicMode="page"
                canSharePublicLink={nativeShareSupported}
                onPublicLinkClick={handleLinkClick}
                onCopyPublicLink={(currentLink) => void copyValue(
                  currentLink.url,
                  `Copied ${currentLink.ogTitle || 'link'} URL.`,
                )}
                onSharePublicLink={
                  nativeShareSupported
                    ? (currentLink) => void shareValue(
                      {
                        title: currentLink.ogTitle || currentLink.url,
                        text: currentLink.ogDescription || `Open ${currentLink.url}`,
                        url: currentLink.url,
                      },
                      'Share sheet opened.',
                    )
                    : undefined
                }
              />
            ))}
          </div>
        ) : null}

        {view === 'qr' ? (
          <div
            id="view-panel-qr"
            className="qr-view"
            role="tabpanel"
            aria-labelledby="view-tab-qr"
          >
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
        ) : null}

        {view === 'embed' ? (
          <div
            id="view-panel-embed"
            className="embed-panel"
            role="tabpanel"
            aria-labelledby="view-tab-embed"
          >
            <div className="embed-panel-head">
              <div>
                <h2>Read-only embed</h2>
                <p>
                  The iframe hides authenticated navigation, skips preview analytics, and resizes itself for up to{' '}
                  {list.links.length} shared link{list.links.length === 1 ? '' : 's'}.
                </p>
              </div>
              <div className="theme-toggle" role="group" aria-label="Embed theme">
                {(['system', 'light', 'dark'] as const).map((theme) => (
                  <button
                    key={theme}
                    className={selectedEmbedTheme === theme ? 'active' : ''}
                    onClick={() => setSelectedEmbedTheme(theme)}
                  >
                    {theme[0].toUpperCase() + theme.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="embed-preview-card">
              {previewUrl ? (
                <iframe
                  ref={previewFrameRef}
                  src={previewUrl}
                  title={`Preview embed for /${slug}`}
                  loading="lazy"
                  className="embed-preview"
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  style={{ height: `${previewHeight}px` }}
                />
              ) : (
                <div className="embed-preview-loading" aria-label="Loading embed preview" />
              )}
            </div>

            <div className="embed-code-card">
              <div className="embed-code-head">
                <h3>Generated iframe code</h3>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => void copyValue(embedCode, 'Embed code copied.')}
                  disabled={!embedCode}
                >
                  {icon('code')}
                  Copy code
                </button>
              </div>
              <textarea
                readOnly
                className="embed-code"
                aria-label="Embed code"
                value={embedCode}
              />
            </div>
          </div>
        ) : null}
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
          margin-bottom: 8px;
        }

        .pub-header-copy {
          min-width: 0;
        }

        .pub-header-tools {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
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
          justify-content: space-between;
          gap: 12px;
          font-size: 15px;
          margin-bottom: 16px;
        }

        .pub-banner-copy {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .pub-banner-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
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

        .share-toolbar {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          line-height: 1;
        }

        .toolbar-btn:hover:not(:disabled) {
          background: var(--bg-secondary);
          border-color: var(--input-border);
        }

        .toolbar-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .view-toggle {
          display: inline-flex;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          flex-shrink: 0;
          margin-top: 4px;
          background: var(--surface);
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

        .share-status {
          min-height: 20px;
          margin: 0 0 8px;
          color: var(--text-muted);
          font-size: 13px;
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

        .qr-loading,
        .embed-preview-loading {
          border-radius: var(--radius);
          background: var(--border);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .qr-loading {
          width: 256px;
          height: 256px;
        }

        .embed-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-top: 8px;
        }

        .embed-panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .embed-panel-head h2,
        .embed-code-head h3 {
          margin: 0 0 6px;
          font-size: 16px;
          font-weight: 600;
        }

        .embed-panel-head p {
          margin: 0;
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.5;
          max-width: 560px;
        }

        .theme-toggle {
          display: inline-flex;
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 6px;
          padding: 2px;
          flex-shrink: 0;
        }

        .theme-toggle button {
          border: 0;
          border-radius: 4px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 12px;
          padding: 4px 10px;
        }

        .theme-toggle button.active {
          background: var(--bg);
          color: var(--text);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .embed-preview-card,
        .embed-code-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
        }

        .embed-preview {
          width: 100%;
          border: 0;
          border-radius: 12px;
          background: var(--bg);
        }

        .embed-preview-loading {
          width: 100%;
          height: 360px;
        }

        .embed-code-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .embed-code {
          width: 100%;
          min-height: 240px;
          resize: vertical;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg);
          color: var(--text);
          padding: 12px;
          font-size: 13px;
          line-height: 1.45;
          font-family: var(--font-mono);
        }

        @media (max-width: 720px) {
          .pub-header,
          .embed-panel-head {
            flex-direction: column;
          }

          .pub-header-tools {
            width: 100%;
            align-items: stretch;
            justify-content: flex-start;
          }

          .share-toolbar,
          .pub-banner-actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 640px) {
          .pub-banner {
            flex-direction: column;
            align-items: flex-start;
          }

          .view-toggle {
            width: 100%;
          }

          .view-toggle-btn {
            flex: 1;
            justify-content: center;
          }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
