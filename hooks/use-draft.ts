'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import type { Draft, DraftLink, DraftSection } from '@/lib/types';
import { coerceDraftSections, createDefaultSection, reindexLinksBySection } from '@/lib/sections';

const DRAFT_KEY = 'urlist-draft';
const DRAFT_STALENESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SAVE_DEBOUNCE_MS = 500;

const DraftLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  sectionId: z.string().optional(),
  position: z.number(),
  pinned: z.boolean().optional().default(false),
  ogTitle: z.string().nullable(),
  ogDescription: z.string().nullable(),
  ogImage: z.string().nullable(),
  ogSiteName: z.string().nullable(),
  ogLoading: z.boolean().optional(),
});

const DraftSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
});

const DraftSchema = z.object({
  slug: z.string(),
  description: z.string(),
  sections: z.array(DraftSectionSchema).optional(),
  links: z.array(DraftLinkSchema),
  savedAt: z.number(),
});

export function normalizeDraft(draft: Draft): Draft {
  const sections = coerceDraftSections(draft.sections);
  return {
    ...draft,
    sections,
    links: reindexLinksBySection(draft.links, sections),
  };
}

export function parseStoredDraft(value: string): Draft | null {
  const parsed = DraftSchema.safeParse(JSON.parse(value));
  if (!parsed.success) return null;

  const defaultSection = createDefaultSection();
  return normalizeDraft({
    ...parsed.data,
    sections: parsed.data.sections ?? [defaultSection],
    links: parsed.data.links.map((link) => ({
      ...link,
      sectionId: link.sectionId ?? defaultSection.id,
    })),
  });
}

export function getDraftStoragePayload(draft: Draft): Draft {
  const normalized = normalizeDraft(draft);
  const cleanLinks = normalized.links.map((link) => {
    const cleanLink = { ...link };
    delete cleanLink.ogLoading;
    return cleanLink;
  });
  return { ...normalized, links: cleanLinks, savedAt: Date.now() };
}

function getDraftKey(listId?: string): string {
  return listId ? `${DRAFT_KEY}-${listId}` : DRAFT_KEY;
}

function loadDraft(listId?: string): Draft | null {
  if (typeof window === 'undefined') return null;

  try {
    const key = getDraftKey(listId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = parseStoredDraft(stored);
    if (!parsed) {
      localStorage.removeItem(key);
      return null;
    }

    // Check staleness
    if (Date.now() - parsed.savedAt > DRAFT_STALENESS_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft, listId?: string): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const key = getDraftKey(listId);
    localStorage.setItem(key, JSON.stringify(getDraftStoragePayload(draft)));
    return true;
  } catch {
    return false;
  }
}

function clearDraft(listId?: string): void {
  if (typeof window === 'undefined') return;

  try {
    const key = getDraftKey(listId);
    localStorage.removeItem(key);
  } catch {
    // Ignore errors
  }
}

export function useDraft(listId?: string) {
  const [state, setState] = useState<{ slug: string; description: string; sections: DraftSection[]; links: DraftLink[]; loaded: boolean }>({
    slug: '',
    description: '',
    sections: [createDefaultSection()],
    links: [],
    loaded: false,
  });
  const [saveError, setSaveError] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft from localStorage after hydration to avoid server/client mismatch
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = loadDraft(listId);
      if (draft) {
        setState((prev) => ({
          ...prev,
          slug: draft.slug,
          description: draft.description,
          sections: draft.sections,
          links: draft.links,
          loaded: true,
        }));
      } else {
        setState((prev) => ({ ...prev, loaded: true }));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [listId]);

  const { slug, description, sections, links, loaded } = state;

  const setSlug = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, slug: typeof val === 'function' ? val(prev.slug) : val }));
  }, []);

  const setDescription = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, description: typeof val === 'function' ? val(prev.description) : val }));
  }, []);

  const setLinks = useCallback((val: DraftLink[] | ((prev: DraftLink[]) => DraftLink[])) => {
    setState((prev) => ({ ...prev, links: typeof val === 'function' ? val(prev.links) : val }));
  }, []);

  const setSections = useCallback((val: DraftSection[] | ((prev: DraftSection[]) => DraftSection[])) => {
    setState((prev) => {
      const nextSections = coerceDraftSections(typeof val === 'function' ? val(prev.sections) : val);
      return {
        ...prev,
        sections: nextSections,
        links: reindexLinksBySection(prev.links, nextSections),
      };
    });
  }, []);

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!loaded) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const ok = saveDraft({ slug, description, sections, links, savedAt: Date.now() }, listId);
      setSaveError(!ok);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [slug, description, sections, links, listId, loaded]);

  const clearCurrentDraft = useCallback(() => {
    clearDraft(listId);
    setSlug('');
    setDescription('');
    setSections([createDefaultSection()]);
    setLinks([]);
  }, [listId, setSlug, setDescription, setSections, setLinks]);

  const addLink = useCallback((link: DraftLink) => {
    setLinks((prev) => {
      const sectionId = link.sectionId || sections[0].id;
      const position = prev.filter((candidate) => candidate.sectionId === sectionId).length;
      return [...prev, { ...link, sectionId, position, pinned: false }];
    });
  }, [sections, setLinks]);

  const removeLink = useCallback((linkId: string) => {
    setLinks((prev) => reindexLinksBySection(prev.filter((l) => l.id !== linkId), sections));
  }, [sections, setLinks]);

  const updateLink = useCallback((linkId: string, updates: Partial<DraftLink>) => {
    setLinks((prev) => reindexLinksBySection(prev.map((l) => (l.id === linkId ? { ...l, ...updates } : l)), sections));
  }, [sections, setLinks]);

  const reorderLinks = useCallback((reordered: DraftLink[]) => {
    setLinks(reindexLinksBySection(reordered, sections));
  }, [sections, setLinks]);

  const moveLinkToSection = useCallback((linkId: string, sectionId: string) => {
    setLinks((prev) => {
      const targetPosition = prev.filter((l) => l.sectionId === sectionId && l.id !== linkId).length;
      return reindexLinksBySection(prev.map((l) => (
        l.id === linkId ? { ...l, sectionId, position: targetPosition } : l
      )), sections);
    });
  }, [sections, setLinks]);

  const pinLink = useCallback((linkId: string) => {
    setLinks((prev) =>
      prev.map((l) => ({ ...l, pinned: l.id === linkId ? !l.pinned : false })),
    );
  }, [setLinks]);

  return {
    slug,
    setSlug,
    description,
    setDescription,
    sections,
    setSections,
    links,
    setLinks,
    loaded,
    saveError,
    addLink,
    updateLink,
    removeLink,
    reorderLinks,
    moveLinkToSection,
    pinLink,
    clearDraft: clearCurrentDraft,
  };
}
