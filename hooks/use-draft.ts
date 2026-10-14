'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import type { Draft, DraftLink, ListVisibility } from '@/lib/types';

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
  visibility: z.enum(['public', 'unlisted', 'password-protected']).optional().default('public'),
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

function saveDraft(draft: Draft, listId?: string): boolean {
  if (typeof window === 'undefined') return true;

  try {
    const key = getDraftKey(listId);
    // Strip transient ogLoading flag before persisting
    const cleanLinks = draft.links.map((link) => ({
      id: link.id,
      url: link.url,
      position: link.position,
      pinned: link.pinned,
      ogTitle: link.ogTitle,
      ogDescription: link.ogDescription,
      ogImage: link.ogImage,
      ogSiteName: link.ogSiteName,
    }));
    localStorage.setItem(key, JSON.stringify({ ...draft, links: cleanLinks, savedAt: Date.now() }));
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
  const [state, setState] = useState<{ slug: string; description: string; visibility: ListVisibility; links: DraftLink[]; loaded: boolean }>({
    slug: '',
    description: '',
    visibility: 'public',
    links: [],
    loaded: false,
  });
  const [saveError, setSaveError] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft from localStorage after hydration to avoid server/client mismatch
  useEffect(() => {
    const draft = loadDraft(listId);
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- draft hydration must happen after localStorage is available client-side
      setState((prev) => ({ ...prev, slug: draft.slug, description: draft.description, visibility: draft.visibility, links: draft.links, loaded: true }));
    } else {
      setState((prev) => ({ ...prev, loaded: true }));
    }
  }, [listId]);

  const { slug, description, visibility, links, loaded } = state;

  const setSlug = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, slug: typeof val === 'function' ? val(prev.slug) : val }));
  }, []);

  const setDescription = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, description: typeof val === 'function' ? val(prev.description) : val }));
  }, []);

  const setVisibility = useCallback((val: ListVisibility | ((prev: ListVisibility) => ListVisibility)) => {
    setState((prev) => ({ ...prev, visibility: typeof val === 'function' ? val(prev.visibility) : val }));
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
      const ok = saveDraft({ slug, description, visibility, links, savedAt: Date.now() }, listId);
      setSaveError(!ok);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [slug, description, visibility, links, listId, loaded]);

  const clearCurrentDraft = useCallback(() => {
    clearDraft(listId);
    setSlug('');
    setDescription('');
    setVisibility('public');
    setLinks([]);
  }, [listId, setSlug, setDescription, setVisibility, setLinks]);

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
    visibility,
    setVisibility,
    links,
    setLinks,
    loaded,
    saveError,
    addLink,
    updateLink,
    removeLink,
    reorderLinks,
    pinLink,
    clearDraft: clearCurrentDraft,
  };
}
