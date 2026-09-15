'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/nav-header';
import { UrlInput } from '@/components/url-input';
import { SectionedLinkList } from '@/components/sectioned-link-list';
import { useDraft } from '@/hooks/use-draft';
import { useAuth } from '@/hooks/use-auth';
import type { DraftLink, ListWithLinks } from '@/lib/types';
import { MAX_SECTION_NAME_LENGTH, MAX_SECTIONS, reindexLinksBySection, sortSections } from '@/lib/sections';
import { nanoid } from 'nanoid';

interface EditPageProps {
  params: Promise<{ listId: string }>;
}

export default function EditComposePage({ params }: EditPageProps) {
  const { listId } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    description,
    setDescription,
    sections,
    setSections,
    links,
    setLinks,
    loaded,
    addLink,
    updateLink,
    removeLink,
    moveLinkToSection,
    pinLink,
    clearDraft,
  } = useDraft(listId);

  const [listData, setListData] = useState<ListWithLinks | null>(null);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSectionId, setTargetSectionId] = useState(sections[0].id);
  const orderedSections = sortSections(sections);
  const sectionValidationError = sections.length > MAX_SECTIONS
    ? `Lists can have up to ${MAX_SECTIONS} sections.`
    : sections.some((section) => section.name.trim().length === 0)
      ? 'Every section needs a heading.'
      : null;

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  // Fetch existing list data
  useEffect(() => {
    async function fetchList() {
      try {
        const res = await fetch(`/api/lists/${listId}`);
        if (!res.ok) {
          setError('List not found.');
          return;
        }
        const data: ListWithLinks = await res.json();
        setListData(data);

        // Only populate draft if draft is empty (not previously saved)
        if (loaded && links.length === 0) {
          setDescription(data.description);
          setSections(data.sections);
          setLinks(
            data.links.map((l) => ({
              id: l.id,
              url: l.url,
              sectionId: l.sectionId ?? data.sections[0].id,
              position: l.position,
              pinned: l.pinned ?? false,
              ogTitle: l.ogTitle,
              ogDescription: l.ogDescription,
              ogImage: l.ogImage,
              ogSiteName: l.ogSiteName,
            }))
          );
        }
      } catch {
        setError('Failed to load list.');
      } finally {
        setFetching(false);
      }
    }

    if (loaded) {
      void fetchList();
    }
  }, [listId, loaded, links.length, setDescription, setSections, setLinks]);

  useEffect(() => {
    if (!sections.some((section) => section.id === targetSectionId)) {
      setTargetSectionId(sections[0].id);
    }
  }, [sections, targetSectionId]);

  const handleAddUrl = useCallback(
    (url: string) => {
      const linkId = nanoid(10);
      const newLink: DraftLink = {
        id: linkId,
        url,
        sectionId: targetSectionId,
        position: links.length,
        pinned: false,
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
    [links.length, targetSectionId, addLink, updateLink]
  );

  const handleAddSection = useCallback(() => {
    if (sections.length >= MAX_SECTIONS) {
      setError(`Lists can have up to ${MAX_SECTIONS} sections.`);
      return;
    }
    const section = {
      id: `section-${nanoid(8)}`,
      name: `Section ${sections.length + 1}`,
      position: sections.length,
    };
    setSections((prev) => [...prev, section]);
    setTargetSectionId(section.id);
  }, [sections.length, setSections]);

  const handleRenameSection = useCallback((sectionId: string, name: string) => {
    setSections((prev) => prev.map((section) => (
      section.id === sectionId ? { ...section, name: name.slice(0, MAX_SECTION_NAME_LENGTH) } : section
    )));
  }, [setSections]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    if (sections.length <= 1) return;
    const remainingSections = sortSections(sections.filter((section) => section.id !== sectionId))
      .map((section, position) => ({ ...section, position }));
    const fallbackSectionId = remainingSections[0].id;
    setSections(remainingSections);
    setLinks((prev) => reindexLinksBySection(prev.map((link) => (
      link.sectionId === sectionId ? { ...link, sectionId: fallbackSectionId } : link
    )), remainingSections));
    setTargetSectionId((current) => (current === sectionId ? fallbackSectionId : current));
  }, [sections, setSections, setLinks]);

  const handleSave = async () => {
    if (!listData) return;
    setSaving(true);
    setError(null);

    try {
      if (!user) {
        setError('You must be signed in to edit a list.');
        return;
      }

      const res = await fetch(`/api/lists/${listId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description,
          updatedAt: listData.updatedAt,
          links: links.map((l) => ({
            id: l.id,
            url: l.url,
            sectionId: l.sectionId,
            position: l.position,
            pinned: l.pinned,
            ogTitle: l.ogTitle,
            ogDescription: l.ogDescription,
            ogImage: l.ogImage,
            ogSiteName: l.ogSiteName,
          })),
          sections: orderedSections.map((section, position) => ({ ...section, name: section.name.trim(), position })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Failed to save changes.');
        return;
      }

      clearDraft();
      router.push(`/${listData.slug}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || fetching || !loaded) {
    return (
      <div>
        <NavHeader />
        <main
          style={{
            maxWidth: '860px',
            margin: '0 auto',
            padding: '28px 16px 48px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                height: '26px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '18px',
                width: '220px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
            <div
              style={{
                height: '74px',
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
                height: '120px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
              }}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      <NavHeader />
      <main
        style={{
          maxWidth: '860px',
          margin: '0 auto',
          padding: '28px 16px 48px',
        }}
      >
        <header className="compose-header">
          <h1>Edit list</h1>
          {listData ? (
            <p
              className="muted"
              style={{
                marginTop: '6px',
                fontSize: '15px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              /{listData.slug}
            </p>
          ) : null}
        </header>

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

        <div className="compose-meta-panel">
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
            <p className="char-count">{description.length}/280</p>
          </div>
        </div>

        <div className="field-group">
          <label className="label">Add links</label>
          <UrlInput onSubmit={handleAddUrl} placeholder="Paste a URL..." size="large" />
        </div>

        {orderedSections.length > 1 ? (
          <label className="target-section">
            <span className="label">New links go to</span>
            <select className="input" value={targetSectionId} onChange={(e) => setTargetSectionId(e.target.value)}>
              {orderedSections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {sectionValidationError && (
          <div style={{ color: 'var(--danger)', fontSize: '15px', marginBottom: 12 }}>
            {sectionValidationError}
          </div>
        )}

        <section className="field-group">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <SectionedLinkList
              sections={orderedSections}
              links={links}
              onAddSection={handleAddSection}
              onRenameSection={handleRenameSection}
              onDeleteSection={handleDeleteSection}
              onReorderSections={setSections}
              onLinksChange={setLinks}
              onDeleteLink={removeLink}
              onUpdateLink={updateLink}
              onPinLink={pinLink}
              onMoveLinkToSection={moveLinkToSection}
            />
          </div>
        </section>

        <div className="compose-actions">
          <button
            onClick={handleSave}
            disabled={links.length === 0 || saving || !!sectionValidationError}
            className="btn btn-primary"
            style={links.length === 0 || saving || !!sectionValidationError ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span className="small muted">{links.length} link{links.length === 1 ? '' : 's'}</span>
        </div>

        <style jsx>{`
          .compose-header {
            margin-bottom: 20px;
          }
          .compose-header h1 {
            font-size: 20px;
            font-weight: 600;
          }
          .compose-meta-panel {
            background: var(--surface);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-radius: 10px;
            padding: 16px 16px 4px;
            margin-bottom: 14px;
          }
          .field-group {
            margin-bottom: 14px;
          }
          .section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .section-head h2 {
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .compose-actions {
            margin-top: 16px;
            display: flex;
            gap: 8px;
            align-items: center;
          }
          .target-section {
            display: block;
            max-width: 280px;
            margin: -4px 0 14px;
          }
        `}</style>
      </main>
    </div>
  );
}
