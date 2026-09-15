'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { z } from 'zod';
import { DEFAULT_DRAFT_BRANDING, normalizeDraftBranding } from '@/lib/list-branding';
import type { Draft, DraftBranding, DraftLink } from '@/lib/types';

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
  branding: z.object({
    publicTitle: z.string().optional().default(''),
    socialTitle: z.string().optional().default(''),
    socialDescription: z.string().optional().default(''),
    coverImageUrl: z.string().optional().default(''),
    socialImageUrl: z.string().optional().default(''),
    appearance: z.object({
      theme: z.enum(['default', 'sunset', 'ocean', 'midnight']).optional().default('default'),
      accent: z.enum(['coral', 'teal', 'violet', 'amber']).optional().default('coral'),
      layout: z.enum(['comfortable', 'compact', 'cards']).optional().default('comfortable'),
    }).optional().default(DEFAULT_DRAFT_BRANDING.appearance),
  }).optional().default(DEFAULT_DRAFT_BRANDING),
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
    const cleanLinks = draft.links.map((link) => {
      const cleanLink = { ...link };
      delete cleanLink.ogLoading;
      return cleanLink;
    });
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
  const [state, setState] = useState<{ slug: string; description: string; branding: DraftBranding; links: DraftLink[]; loaded: boolean }>({
    slug: '',
    description: '',
    branding: DEFAULT_DRAFT_BRANDING,
    links: [],
    loaded: false,
  });
  const [saveError, setSaveError] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft from localStorage after hydration to avoid server/client mismatch
  useEffect(() => {
    const draft = loadDraft(listId);
    queueMicrotask(() => {
      if (draft) {
        setState((prev) => ({
          ...prev,
          slug: draft.slug,
          description: draft.description,
          branding: normalizeDraftBranding(draft.branding),
          links: draft.links,
          loaded: true,
        }));
      } else {
        setState((prev) => ({ ...prev, loaded: true }));
      }
    });
  }, [listId]);

  const { slug, description, branding, links, loaded } = state;

  const setSlug = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, slug: typeof val === 'function' ? val(prev.slug) : val }));
  }, []);

  const setDescription = useCallback((val: string | ((prev: string) => string)) => {
    setState((prev) => ({ ...prev, description: typeof val === 'function' ? val(prev.description) : val }));
  }, []);

  const setBranding = useCallback((val: DraftBranding | ((prev: DraftBranding) => DraftBranding)) => {
    setState((prev) => ({
      ...prev,
      branding: normalizeDraftBranding(typeof val === 'function' ? val(prev.branding) : val),
    }));
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
      const ok = saveDraft({ slug, description, branding, links, savedAt: Date.now() }, listId);
      setSaveError(!ok);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [slug, description, branding, links, listId, loaded]);

  const clearCurrentDraft = useCallback(() => {
    clearDraft(listId);
    setSlug('');
    setDescription('');
    setBranding(DEFAULT_DRAFT_BRANDING);
    setLinks([]);
  }, [listId, setSlug, setDescription, setBranding, setLinks]);

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

  const updateBranding = useCallback((updates: Partial<DraftBranding>) => {
    setBranding((prev) => normalizeDraftBranding({ ...prev, ...updates }));
  }, [setBranding]);

  return {
    slug,
    setSlug,
    description,
    setDescription,
    branding,
    setBranding,
    updateBranding,
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
