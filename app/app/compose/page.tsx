'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavHeader } from '@/components/nav-header';
import { SlugInput } from '@/components/slug-input';
import { UrlInput } from '@/components/url-input';
import { SortableLinkList } from '@/components/sortable-link-list';
import { PublishButton } from '@/components/publish-button';
import { useDraft } from '@/hooks/use-draft';
import { useDebounce } from '@/hooks/use-debounce';
import { validateSlugFormat } from '@/lib/slug';
import type { DraftLink, SlugValidationStatus } from '@/lib/types';
import { nanoid } from 'nanoid';

function ComposeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Auth is handled via httpOnly cookies automatically
  const {
    slug,
    setSlug,
    description,
    setDescription,
    links,
    loaded,
    addLink,
    updateLink,
    removeLink,
    reorderLinks,
    clearDraft,
  } = useDraft();

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugApiResult, setSlugApiResult] = useState<{ available: boolean; slug: string } | null>(null);
  const [initialUrlProcessed, setInitialUrlProcessed] = useState(false);
  const debouncedSlug = useDebounce(slug, 400);

  // Derive slug status from state
  const slugStatus: SlugValidationStatus = useMemo(() => {
    if (!slug) return 'idle';
    const formatCheck = validateSlugFormat(slug);
    if (!formatCheck.valid) return 'invalid';
    if (debouncedSlug !== slug) return 'checking';
    if (slugApiResult && slugApiResult.slug === debouncedSlug) {
      return slugApiResult.available ? 'valid' : 'taken';
    }
    return 'checking';
  }, [slug, debouncedSlug, slugApiResult]);

  // Check slug availability (only API call in effect — setState only in async callbacks)
  useEffect(() => {
    if (!debouncedSlug) return;
    const formatCheck = validateSlugFormat(debouncedSlug);
    if (!formatCheck.valid) return;

    const controller = new AbortController();
    fetch(`/api/slugs/${encodeURIComponent(debouncedSlug)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setSlugApiResult({ available: !!data.available, slug: debouncedSlug });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [debouncedSlug]);

  const handleAddUrl = useCallback(
    (url: string) => {
      setError(null);
      const linkId = nanoid(10);
      const newLink: DraftLink = {
        id: linkId,
        url,
        position: links.length,
        ogTitle: null,
        ogDescription: null,
        ogImage: null,
        ogSiteName: null,
        ogLoading: true,
      };
      addLink(newLink);

      fetch('/api/og', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.ogTitle || data.ogDescription || data.ogImage || data.ogSiteName) {
            updateLink(linkId, {
              ogTitle: data.ogTitle,
              ogDescription: data.ogDescription,
              ogImage: data.ogImage,
              ogSiteName: data.ogSiteName,
              ogLoading: false,
            });
          } else {
            updateLink(linkId, { ogLoading: false });
          }
        })
        .catch(() => {
          updateLink(linkId, { ogLoading: false });
        });
    },
    [links.length, addLink, updateLink]
  );

  // Auto-add URL from query param, then strip it so refreshes don't re-add
  useEffect(() => {
    if (loaded && !initialUrlProcessed) {
      const urlParam = searchParams.get('url');
      if (urlParam) {
        void handleAddUrl(urlParam);
        router.replace('/app/compose', { scroll: false });
      }
      setInitialUrlProcessed(true);
    }
  }, [loaded, initialUrlProcessed, searchParams, handleAddUrl, router]);

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const res = await fetch('/api/lists', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          slug: slug || undefined,
          description,
          links: links.map((l, i) => ({
            url: l.url,
            position: i,
            ogTitle: l.ogTitle,
            ogDescription: l.ogDescription,
            ogImage: l.ogImage,
            ogSiteName: l.ogSiteName,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Failed to publish list.');
        return;
      }

      clearDraft();
      router.push(`${data.publicUrl}?published=true`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const isPublishDisabled =
    links.length === 0 ||
    slugStatus === 'invalid' ||
    slugStatus === 'taken' ||
    slugStatus === 'checking';

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <NavHeader />
        <main style={{ maxWidth: '860px', margin: '0 auto', padding: '28px 16px 48px' }}>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div
              style={{
                height: '36px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '44px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '88px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
          </div>
        </main>
        <style jsx>{`
          .field-group {
            margin-bottom: 14px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <NavHeader />
      <div className="compose-meta-panel">
        <div className="compose-meta-panel-inner">
          {error && (
            <div
              style={{
                color: 'var(--danger)',
                fontSize: '15px',
                marginBottom: '12px',
              }}
            >
              {error}
            </div>
          )}

          <div className="compose-meta-row">
            <SlugInput value={slug} onChange={setSlug} />

            <div className="field-group">
              <label htmlFor="description" className="label">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 280))}
                placeholder="What's this list about?"
                className="input"
              />
              <div className="char-count">
                <span>{description.length}</span>/280
              </div>
            </div>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '28px 16px 48px' }}>
        <div className="page">
          <UrlInput
            onSubmit={handleAddUrl}
            placeholder="https://example.com"
            size="large"
          />

          <div className="section-head">
            <h2>
              Links <span className="count-badge">{links.length}</span>
            </h2>
          </div>

          <div className="pub-links">
            <SortableLinkList links={links} onReorder={reorderLinks} onDelete={removeLink} onUpdate={updateLink} />
          </div>

          <div className="compose-actions">
            <PublishButton onClick={handlePublish} disabled={isPublishDisabled} loading={publishing} />
            <span className="small muted">{links.length} links</span>
          </div>
        </div>

      </main>
      <style jsx>{`
        .compose-meta-panel {
          background: var(--surface);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 24px 16px 4px;
        }

        .compose-meta-panel-inner {
          max-width: 860px;
          margin: 0 auto;
        }

        .field-group {
          margin-bottom: 14px;
        }

        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          padding-bottom: 0;
        }

        .section-head h2 {
          font-size: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0;
        }

        .compose-actions {
          margin-top: 16px;
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .compose-meta-row {
          display: flex;
          gap: 16px;
        }

        .compose-meta-row .field-group {
          flex: 1;
          min-width: 0;
        }

        .pub-links {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        @media (max-width: 580px) {
          .compose-meta-row {
            flex-direction: column;
            gap: 0;
          }
        }
      `}</style>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense>
      <ComposeContent />
    </Suspense>
  );
}
