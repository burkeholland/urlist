'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import type { Draft, DraftLink } from '@/lib/types';

const DRAFT_KEY = 'urlist-draft';
const DRAFT_STALENESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SAVE_DEBOUNCE_MS = 500;

const DraftLinkSchema = z.object({
  id: z.string(),
  url: z.string(),
  position: z.number(),
  pinned: z.boolean().optional().default(false),
  ogTitle: z.string().nullable(),
  ogDescription: z.string().nullable(),
  ogImage: z.string().nullable(),
  ogSiteName: z.string().nullable(),
  ogLoading: z.boolean().optional(),
});

const DraftSchema = z.object({
  slug: z.string(),
  description: z.string(),
  links: z.array(DraftLinkSchema),
  savedAt: z.number(),
});

function getDraftKey(listId?: string): string {
  return listId ? `${DRAFT_KEY}-${listId}` : DRAFT_KEY;
}

function loadDraft(listId?: string): Draft | null {
  if (typeof window === 'undefined') return null;

  try {
    const key = getDraftKey(listId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed = DraftSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) {
      localStorage.removeItem(key);
      return null;
    }

    // Check staleness
    if (Date.now() - parsed.data.savedAt > DRAFT_STALENESS_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft, listId?: string): void {
  if (typeof window === 'undefined') return;

  try {
    const key = getDraftKey(listId);
    // Strip transient ogLoading flag before persisting
    const cleanLinks = draft.links.map(({ ogLoading: _, ...rest }) => rest);
    localStorage.setItem(key, JSON.stringify({ ...draft, links: cleanLinks, savedAt: Date.now() }));
  } catch {
    return;
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
  const [state, setState] = useState<{ slug: string; description: string; links: DraftLink[]; loaded: boolean }>({
    slug: '',
    description: '',
    links: [],
    loaded: false,
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft from localStorage after hydration to avoid server/client mismatch
  useEffect(() => {
    const draft = loadDraft(listId);
    if (draft) {
      setState((prev) => ({ ...prev, slug: draft.slug, description: draft.description, links: draft.links, loaded: true }));
    } else {
      setState((prev) => ({ ...prev, loaded: true }));
    }
  }, [listId]);

  const { slug, description, links, loaded } = state;

  const setSlug = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, slug: typeof val === 'function' ? val(prev.slug) : val }));
  }, []);

  const setDescription = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, description: typeof val === 'function' ? val(prev.description) : val }));
  }, []);

  const setLinks = useCallback((val: DraftLink[] | ((prev: DraftLink[]) => DraftLink[])) => {
    setState((prev) => ({ ...prev, links: typeof val === 'function' ? val(prev.links) : val }));
  }, []);

  // Auto-save on changes (debounced)
  useEffect(() => {
    if (!loaded) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveDraft({ slug, description, links, savedAt: Date.now() }, listId);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [slug, description, links, listId, loaded]);

  const clearCurrentDraft = useCallback(() => {
    clearDraft(listId);
    setSlug('');
    setDescription('');
    setLinks([]);
  }, [listId, setSlug, setDescription, setLinks]);

  const addLink = useCallback((link: DraftLink) => {
    setLinks((prev) => [...prev, { ...link, position: prev.length, pinned: false }]);
  }, [setLinks]);

  const removeLink = useCallback((linkId: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== linkId).map((l, i) => ({ ...l, position: i })));
  }, [setLinks]);

  const updateLink = useCallback((linkId: string, updates: Partial<DraftLink>) => {
    setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, ...updates } : l)));
  }, [setLinks]);

  const reorderLinks = useCallback((reordered: DraftLink[]) => {
    setLinks(reordered.map((l, i) => ({ ...l, position: i })));
  }, [setLinks]);

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
    links,
    setLinks,
    loaded,
    addLink,
    updateLink,
    removeLink,
    reorderLinks,
    pinLink,
    clearDraft: clearCurrentDraft,
  };
}
