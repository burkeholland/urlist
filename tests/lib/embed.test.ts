import { describe, expect, it } from 'vitest';
import {
  buildEmbedUrl,
  createEmbedCode,
  EMBED_QUERY_VALUE,
  estimateEmbedHeight,
  getAdjacentPublicListViewMode,
  getFirstSearchParam,
  getPublicRenderOptions,
  isAnalyticsSurface,
  isPublicListPath,
  parseEmbedTheme,
  PUBLIC_LIST_VIEW_MODES,
  shouldBootstrapAuth,
  shouldTrackEmbedAnalytics,
} from '@/lib/embed';
import { RESERVED_PREFIXES } from '@/lib/slug';

describe('parseEmbedTheme', () => {
  it('accepts supported themes', () => {
    expect(parseEmbedTheme('light')).toBe('light');
    expect(parseEmbedTheme('dark')).toBe('dark');
    expect(parseEmbedTheme('system')).toBe('system');
  });

  it('falls back to system for invalid themes', () => {
    expect(parseEmbedTheme('sepia')).toBe('system');
    expect(parseEmbedTheme(undefined)).toBe('system');
  });
});

describe('getPublicRenderOptions', () => {
  it('parses embed, preview, and theme params', () => {
    expect(
      getPublicRenderOptions({
        embed: EMBED_QUERY_VALUE,
        preview: EMBED_QUERY_VALUE,
        theme: 'dark',
      }),
    ).toEqual({
      isEmbed: true,
      isPreview: true,
      theme: 'dark',
    });
  });

  it('defaults to normal page rendering', () => {
    expect(getPublicRenderOptions({})).toEqual({
      isEmbed: false,
      isPreview: false,
      theme: 'system',
    });
  });
});

describe('isPublicListPath', () => {
  it.each(['/my-list', '/nested/list', '/apiary', '/application', '//my-list'])(
    'treats %s as a public list',
    (path) => {
      expect(isPublicListPath(path)).toBe(true);
    },
  );

  it.each([
    '/',
    '',
    '/app',
    '/app/',
    '/app/my-links',
    '/app/analytics/abc',
    '/app/compose/abc',
    '/api/auth/me',
    '/_next/static/x.js',
    '/%61pp/my-links',
    '/%61pi/lists',
    '/%E0%A4%A',
  ])('does not treat %s as a public list', (path) => {
    expect(isPublicListPath(path)).toBe(false);
  });

  it('covers every reserved prefix', () => {
    for (const prefix of RESERVED_PREFIXES) {
      expect(isPublicListPath(`/${prefix}`)).toBe(false);
      expect(isPublicListPath(`/${prefix}/anything`)).toBe(false);
    }
  });
});

describe('shouldBootstrapAuth', () => {
  it('skips auth bootstrap only for embeds of public lists', () => {
    expect(shouldBootstrapAuth('/my-list', '?embed=1')).toBe(false);
    expect(shouldBootstrapAuth('/nested/list', '?theme=dark&embed=1')).toBe(false);
  });

  it('keeps auth bootstrap for regular public list pages', () => {
    expect(shouldBootstrapAuth('/my-list', '')).toBe(true);
    expect(shouldBootstrapAuth('/my-list', '?theme=dark')).toBe(true);
    expect(shouldBootstrapAuth('/my-list', '?embed=0')).toBe(true);
  });

  it.each([
    '/app/my-links',
    '/app/analytics',
    '/app/analytics/abc',
    '/app/compose',
    '/app/compose/abc',
    '/api/auth/me',
    '/%61pp/my-links',
    '/',
  ])('still bootstraps auth on %s even with ?embed=1', (path) => {
    expect(shouldBootstrapAuth(path, '?embed=1')).toBe(true);
  });
});

describe('shouldTrackEmbedAnalytics', () => {
  it('suppresses preview iframe analytics', () => {
    expect(shouldTrackEmbedAnalytics({ isEmbed: true, isPreview: true, theme: 'system' })).toBe(false);
  });

  it('tracks normal page and real embed views', () => {
    expect(shouldTrackEmbedAnalytics({ isEmbed: false, isPreview: false, theme: 'system' })).toBe(true);
    expect(shouldTrackEmbedAnalytics({ isEmbed: true, isPreview: false, theme: 'dark' })).toBe(true);
  });
});

describe('isAnalyticsSurface', () => {
  it('accepts only the known surfaces', () => {
    expect(isAnalyticsSurface('page')).toBe(true);
    expect(isAnalyticsSurface('embed')).toBe(true);
    expect(isAnalyticsSurface('preview')).toBe(false);
    expect(isAnalyticsSurface(undefined)).toBe(false);
    expect(isAnalyticsSurface(1)).toBe(false);
  });
});

describe('getFirstSearchParam', () => {
  it('returns the first value of repeated params', () => {
    expect(getFirstSearchParam(['1', '2'])).toBe('1');
    expect(getFirstSearchParam('1')).toBe('1');
    expect(getFirstSearchParam(undefined)).toBeUndefined();
  });
});

describe('buildEmbedUrl', () => {
  it('adds embed params and omits preview by default', () => {
    expect(buildEmbedUrl('https://urlist.test/my-list', 'dark')).toBe(
      'https://urlist.test/my-list?embed=1&theme=dark',
    );
  });

  it('adds preview when requested', () => {
    expect(buildEmbedUrl('https://urlist.test/my-list', 'light', { preview: true })).toBe(
      'https://urlist.test/my-list?embed=1&theme=light&preview=1',
    );
  });
});

describe('estimateEmbedHeight', () => {
  it('clamps the initial iframe height to a safe range', () => {
    expect(estimateEmbedHeight(0)).toBe(320);
    expect(estimateEmbedHeight(2)).toBe(388);
    expect(estimateEmbedHeight(50)).toBe(880);
  });
});

describe('getAdjacentPublicListViewMode', () => {
  it('wraps between tabs with arrow keys', () => {
    expect(getAdjacentPublicListViewMode('list', 'ArrowLeft')).toBe('embed');
    expect(getAdjacentPublicListViewMode('embed', 'ArrowRight')).toBe('list');
    expect(getAdjacentPublicListViewMode('qr', 'ArrowDown')).toBe('embed');
    expect(getAdjacentPublicListViewMode('qr', 'ArrowUp')).toBe('list');
  });

  it('jumps to the first or last tab with home and end', () => {
    expect(getAdjacentPublicListViewMode('embed', 'Home')).toBe(PUBLIC_LIST_VIEW_MODES[0]);
    expect(getAdjacentPublicListViewMode('list', 'End')).toBe(
      PUBLIC_LIST_VIEW_MODES[PUBLIC_LIST_VIEW_MODES.length - 1],
    );
  });

  it('ignores unrelated keys', () => {
    expect(getAdjacentPublicListViewMode('list', 'Enter')).toBeNull();
  });

  it('ignores an unknown current tab', () => {
    expect(getAdjacentPublicListViewMode('bogus' as never, 'ArrowRight')).toBeNull();
  });
});

describe('createEmbedCode', () => {
  it('includes responsive iframe defaults and resize listener', () => {
    const code = createEmbedCode({
      publicUrl: 'https://urlist.test/my-list',
      slug: 'my-list',
      theme: 'system',
      initialHeight: 420,
    });

    expect(code).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"');
    expect(code).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(code).toContain('https://urlist.test/my-list?embed=1&amp;theme=system');
    expect(code).toContain('urlist:embed:resize');
    expect(code).toContain('height:420px');
  });
});
