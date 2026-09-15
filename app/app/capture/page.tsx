'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { NavHeader } from '@/components/nav-header';
import { useAuth } from '@/hooks/use-auth';
import { normalizeCapturedUrl } from '@/lib/url';

interface OwnedList {
  listId: string;
  slug: string;
  description: string;
  updatedAt: number;
  links: { id: string }[];
}

interface StagedCapture {
  url: string;
  title: string | null;
  text: string | null;
  source: 'bookmarklet' | 'share-target';
}

interface SaveResult {
  listId: string;
  publicUrl: string;
  editUrl: string;
  updatedAt: number;
}

const NEW_LIST_DRAFT_KEY = 'urlist-draft';

function buildBookmarklet(actionUrl: string): string {
  const urlLiteral = JSON.stringify(actionUrl);
  return `javascript:(()=>{try{const d=document;const f=d.createElement('form');f.method='POST';f.action=${urlLiteral};f.target='_blank';f.referrerPolicy='no-referrer';f.style.display='none';const text=window.getSelection?String(window.getSelection()||''):'';const fields={url:location.href,title:d.title,text:text.slice(0,500),source:'bookmarklet'};for(const [name,value] of Object.entries(fields)){const input=d.createElement('input');input.type='hidden';input.name=name;input.value=String(value||'');f.appendChild(input)}d.body.appendChild(f);f.submit();setTimeout(()=>f.remove(),0)}catch{alert('Urlist quick capture could not start on this page.')}})();`;
}

function extractMessage(data: unknown, fallback: string): string {
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    data.error &&
    typeof data.error === 'object' &&
    'message' in data.error &&
    typeof data.error.message === 'string'
  ) {
    return data.error.message;
  }

  return fallback;
}

export default function CapturePage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();
  const [lists, setLists] = useState<OwnedList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [ogSiteName, setOgSiteName] = useState<string | null>(null);
  const [stagedSource, setStagedSource] = useState<StagedCapture['source'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [titleDirty, setTitleDirty] = useState(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const selectedList = lists.find((list) => list.listId === selectedListId) ?? null;
  const normalized = useMemo(() => normalizeCapturedUrl(url), [url]);
  const bookmarkletHref = useMemo(() => {
    if (typeof window === 'undefined') {
      return '#';
    }
    return buildBookmarklet(`${window.location.origin}/api/capture/share-target`);
  }, []);

  const loadLists = useCallback(async (): Promise<OwnedList[]> => {
    const res = await fetch('/api/lists', { credentials: 'include' });
    const data = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(data)) {
      throw new Error('Failed to load your lists.');
    }

    const nextLists = data
      .filter((item): item is OwnedList => !!item && typeof item === 'object' && 'listId' in item && 'slug' in item)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    setLists(nextLists);
    setSelectedListId((current) => {
      if (current && nextLists.some((list) => list.listId === current)) {
        return current;
      }
      return nextLists[0]?.listId ?? '';
    });

    return nextLists;
  }, []);

  const loadStagedCapture = useCallback(async () => {
    const res = await fetch('/api/capture/staged', { credentials: 'include' });
    const data = await res.json().catch(() => ({ capture: null }));
    const capture = (data && typeof data === 'object' && 'capture' in data ? data.capture : null) as StagedCapture | null;

    if (!capture) {
      return;
    }

    setUrl(capture.url);
    setTitle(capture.title || '');
    setDescription(capture.text || '');
    setOgImage(null);
    setOgSiteName(null);
    setStagedSource(capture.source);
    setTitleDirty(false);
    setDescriptionDirty(false);
  }, []);

  useEffect(() => {
    setRouteError(new URLSearchParams(window.location.search).get('error'));
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([loadLists(), hydratedRef.current ? Promise.resolve() : loadStagedCapture()])
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load quick capture.');
        }
      })
      .finally(() => {
        hydratedRef.current = true;
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, loadLists, loadStagedCapture, user]);

  useEffect(() => {
    if (!normalized.valid) {
      setPreviewLoading(false);
      setPreviewNotice(null);
      setOgImage(null);
      setOgSiteName(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewNotice(null);

      fetch('/api/og', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized.url }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error(extractMessage(data, 'Preview unavailable. You can still save the link.'));
          }
          return data;
        })
        .then((data) => {
          setOgImage(typeof data?.ogImage === 'string' ? data.ogImage : null);
          setOgSiteName(typeof data?.ogSiteName === 'string' ? data.ogSiteName : null);
          if (!titleDirty && typeof data?.ogTitle === 'string' && data.ogTitle) {
            setTitle(data.ogTitle);
          }
          if (!descriptionDirty && typeof data?.ogDescription === 'string' && data.ogDescription) {
            setDescription(data.ogDescription);
          }
          if (!data?.ogTitle && !data?.ogDescription && !data?.ogImage && !data?.ogSiteName) {
            setPreviewNotice('Preview metadata was unavailable. You can still save the normalized URL.');
          }
        })
        .catch((previewError: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setOgImage(null);
          setOgSiteName(null);
          setPreviewNotice(previewError instanceof Error ? previewError.message : 'Preview unavailable. You can still save the link.');
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setPreviewLoading(false);
          }
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [descriptionDirty, normalized.url, normalized.valid, titleDirty]);

  const handleCreateListInstead = useCallback(() => {
    if (!normalized.valid) {
      setError(normalized.error || 'A valid URL is required.');
      return;
    }

    const draft = {
      slug: '',
      description: '',
      links: [
        {
          id: nanoid(10),
          url: normalized.url,
          position: 0,
          pinned: false,
          ogTitle: title || null,
          ogDescription: description || null,
          ogImage,
          ogSiteName,
        },
      ],
      savedAt: Date.now(),
    };

    window.localStorage.setItem(NEW_LIST_DRAFT_KEY, JSON.stringify(draft));
    router.push('/app/compose');
  }, [description, normalized.error, normalized.url, normalized.valid, ogImage, ogSiteName, router, title]);

  const submitCapture = useCallback(async (duplicateAction: 'reject' | 'allow' = 'reject') => {
    if (!selectedList) {
      setError('Choose a destination list first.');
      return;
    }

    if (!normalized.valid) {
      setError(normalized.error || 'A valid URL is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setDuplicatePending(false);
    setSaveResult(null);

    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId: selectedList.listId,
          updatedAt: selectedList.updatedAt,
          url: normalized.url,
          ogTitle: title || null,
          ogDescription: description || null,
          ogImage,
          ogSiteName,
          duplicateAction,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code =
          data &&
          typeof data === 'object' &&
          'error' in data &&
          data.error &&
          typeof data.error === 'object' &&
          'code' in data.error &&
          typeof data.error.code === 'string'
            ? data.error.code
            : '';

        if (code === 'DUPLICATE_URL') {
          setDuplicatePending(true);
          setError(extractMessage(data, 'That URL already exists in this list.'));
          return;
        }

        if (code === 'CONFLICT') {
          await loadLists();
          setError('This list changed in another tab. We refreshed it — review and save again.');
          return;
        }

        setError(extractMessage(data, 'Failed to save the captured link.'));
        return;
      }

      setSaveResult(data as SaveResult);
      setUrl('');
      setTitle('');
      setDescription('');
      setOgImage(null);
      setOgSiteName(null);
      setStagedSource(null);
      setTitleDirty(false);
      setDescriptionDirty(false);
      await loadLists();
    } catch {
      setError('Failed to save the captured link.');
    } finally {
      setSaving(false);
    }
  }, [description, loadLists, normalized.error, normalized.url, normalized.valid, ogImage, ogSiteName, selectedList, title]);

  const handleCopyBookmarklet = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      setCopiedBookmarklet(true);
      window.setTimeout(() => setCopiedBookmarklet(false), 1500);
    } catch {
      setCopiedBookmarklet(false);
    }
  }, [bookmarkletHref]);

  return (
    <div>
      <NavHeader />
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '28px 16px 48px' }}>
        <header style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600 }}>Quick capture</h1>
          <p className="muted small" style={{ marginTop: '6px' }}>
            Save the page you are browsing into one of your Urlist collections without opening the full composer.
          </p>
        </header>

        {!authLoading && !user ? (
          <section className="capture-panel">
            <p style={{ marginBottom: '12px' }}>
              Sign in to finish capturing links from your browser or mobile share sheet.
            </p>
            {(routeError === 'invalid_capture') && (
              <p className="validation-message">We could not read the shared page. Try launching quick capture again.</p>
            )}
            <button onClick={() => signIn('/app/capture')} className="btn btn-primary">
              Sign in with GitHub
            </button>
          </section>
        ) : loading ? (
          <section className="capture-panel">
            <div className="capture-skeleton" />
            <div className="capture-skeleton capture-skeleton--short" />
            <div className="capture-skeleton capture-skeleton--tall" />
          </section>
        ) : (
          <div className="capture-grid">
            <section className="capture-panel">
              {stagedSource && (
                <div className="capture-banner">
                  {stagedSource === 'bookmarklet' ? 'Captured from your bookmarklet.' : 'Imported from the installed app share sheet.'}
                </div>
              )}
              {routeError === 'invalid_capture' && !stagedSource && (
                <p className="validation-message">We could not read the shared page. Paste the URL below and try again.</p>
              )}
              {saveResult && (
                <div className="capture-success">
                  Saved to <strong>/{lists.find((list) => list.listId === saveResult.listId)?.slug ?? selectedList?.slug}</strong>.
                  <div className="capture-success-links">
                    <Link href={saveResult.editUrl} className="link-style">Open editor</Link>
                    <Link href={saveResult.publicUrl} className="link-style">View public page</Link>
                  </div>
                </div>
              )}
              {error && <p className="validation-message">{error}</p>}

              <div className="field-group">
                <label htmlFor="capture-list" className="label">Destination list</label>
                {lists.length > 0 ? (
                  <select
                    id="capture-list"
                    className="input"
                    value={selectedListId}
                    onChange={(event) => {
                      setSelectedListId(event.target.value);
                      setDuplicatePending(false);
                      setSaveResult(null);
                    }}
                  >
                    {lists.map((list) => (
                      <option key={list.listId} value={list.listId}>
                        /{list.slug} · {list.links.length} link{list.links.length === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="capture-empty">
                    <p className="muted small">You do not have any saved lists yet.</p>
                    <button onClick={handleCreateListInstead} className="btn btn-outline" type="button">
                      Create a new list with this link
                    </button>
                  </div>
                )}
              </div>

              <div className="field-group">
                <label htmlFor="capture-url" className="label">URL</label>
                <input
                  id="capture-url"
                  className={['input input-mono', url && !normalized.valid ? 'input-invalid' : ''].filter(Boolean).join(' ')}
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setDuplicatePending(false);
                    setSaveResult(null);
                    if (error) {
                      setError(null);
                    }
                  }}
                  placeholder="https://example.com"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {url && !normalized.valid && (
                  <p className="validation-message">{normalized.error}</p>
                )}
                {url && normalized.valid && normalized.url !== url && (
                  <p className="muted xsmall" style={{ marginTop: '4px' }}>
                    Saving as <span className="mono">{normalized.url}</span>
                  </p>
                )}
              </div>

              <div className="field-group">
                <label htmlFor="capture-title" className="label">Title</label>
                <input
                  id="capture-title"
                  className="input"
                  value={title}
                  onChange={(event) => {
                    setTitleDirty(true);
                    setTitle(event.target.value.slice(0, 200));
                  }}
                  placeholder="Use the page title or write your own"
                />
                <p className="char-count">{title.length}/200</p>
              </div>

              <div className="field-group">
                <label htmlFor="capture-description" className="label">Description</label>
                <textarea
                  id="capture-description"
                  className="input"
                  value={description}
                  onChange={(event) => {
                    setDescriptionDirty(true);
                    setDescription(event.target.value.slice(0, 500));
                  }}
                  placeholder="Optional note for this saved link"
                  rows={4}
                />
                <p className="char-count">{description.length}/500</p>
              </div>

              {previewLoading ? (
                <p className="muted xsmall">Fetching preview metadata…</p>
              ) : previewNotice ? (
                <p className="muted xsmall">{previewNotice}</p>
              ) : null}

              {selectedList && (
                <p className="muted xsmall" style={{ marginTop: '12px' }}>
                  You are adding to <span className="mono">/{selectedList.slug}</span>.
                </p>
              )}

              <div className="compose-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving || !normalized.valid || lists.length === 0}
                  onClick={() => void submitCapture('reject')}
                  style={saving || !normalized.valid || lists.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                >
                  {saving ? 'Saving…' : 'Save to list'}
                </button>
                {duplicatePending && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={saving}
                    onClick={() => void submitCapture('allow')}
                  >
                    Add duplicate anyway
                  </button>
                )}
              </div>
            </section>

            <aside className="capture-panel">
              <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px' }}>Browser + mobile setup</h2>
              <p className="muted small" style={{ marginBottom: '12px' }}>
                Install the PWA on mobile to get Urlist in the system share sheet, or drag the bookmarklet below into your bookmarks bar for desktop capture.
              </p>
              <div className="capture-bookmarklet-row">
                <a href={bookmarkletHref} className="btn btn-outline">
                  Urlist quick capture
                </a>
                <button type="button" className="btn btn-outline" onClick={() => void handleCopyBookmarklet()}>
                  {copiedBookmarklet ? 'Copied' : 'Copy code'}
                </button>
              </div>
              <ol className="capture-steps">
                <li>Install urlist from your browser menu on mobile.</li>
                <li>Choose <strong>Share</strong> on any page, then pick <strong>urlist</strong>.</li>
                <li>Review the destination list, title, and note before saving.</li>
              </ol>
              <p className="muted xsmall">
                The bookmarklet posts page data directly to Urlist, keeps auth in your session cookie, and does not embed tokens in the bookmark itself.
              </p>
            </aside>
          </div>
        )}
      </main>

      <style jsx>{`
        .capture-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr);
          gap: 16px;
        }
        .capture-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 18px;
        }
        .capture-banner,
        .capture-success {
          background: var(--blue-bg);
          border: 1px solid var(--surface-border);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 14px;
        }
        .capture-success-links {
          display: flex;
          gap: 12px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .field-group {
          margin-bottom: 14px;
        }
        .capture-empty {
          display: flex;
          flex-direction: column;
          align-items: start;
          gap: 10px;
          padding: 12px;
          border-radius: 8px;
          background: var(--bg-secondary);
        }
        .capture-bookmarklet-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .capture-steps {
          margin: 0 0 12px;
          padding-left: 18px;
          display: grid;
          gap: 8px;
        }
        .capture-skeleton {
          height: 38px;
          border-radius: var(--radius);
          background: var(--bg-secondary);
          margin-bottom: 12px;
        }
        .capture-skeleton--short {
          width: 60%;
        }
        .capture-skeleton--tall {
          height: 180px;
          width: 100%;
          margin-bottom: 0;
        }
        .compose-actions {
          margin-top: 16px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        @media (max-width: 800px) {
          .capture-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
