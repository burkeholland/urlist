import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SECTION_ID } from '@/lib/sections';
import { getDraftStoragePayload, parseStoredDraft } from '@/hooks/use-draft';
import type { Draft } from '@/lib/types';

describe('draft persistence helpers', () => {
  it('loads legacy flat drafts into the default section', () => {
    const draft = parseStoredDraft(JSON.stringify({
      slug: 'legacy',
      description: 'old',
      links: [
        {
          id: 'a',
          url: 'https://example.com',
          position: 0,
          pinned: false,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          ogSiteName: null,
        },
      ],
      savedAt: 10,
    }));

    expect(draft?.sections).toEqual([{ id: DEFAULT_SECTION_ID, name: 'Links', position: 0 }]);
    expect(draft?.links[0].sectionId).toBe(DEFAULT_SECTION_ID);
  });

  it('persists sections and strips transient OG loading state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const draft: Draft = {
      slug: 'sectioned',
      description: 'new',
      sections: [
        { id: 'b', name: 'B', position: 1 },
        { id: 'a', name: 'A', position: 0 },
      ],
      links: [
        {
          id: 'one',
          url: 'https://example.com/one',
          sectionId: 'b',
          position: 9,
          pinned: false,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          ogSiteName: null,
          ogLoading: true,
        },
      ],
      savedAt: 1,
    };

    expect(getDraftStoragePayload(draft)).toEqual({
      slug: 'sectioned',
      description: 'new',
      sections: [
        { id: 'a', name: 'A', position: 0 },
        { id: 'b', name: 'B', position: 1 },
      ],
      links: [
        {
          id: 'one',
          url: 'https://example.com/one',
          sectionId: 'b',
          position: 0,
          pinned: false,
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          ogSiteName: null,
        },
      ],
      savedAt: 1234,
    });
  });
});
