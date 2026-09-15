import { describe, expect, it } from 'vitest';
import {
  buildEmbedUrl,
  createEmbedCode,
  EMBED_QUERY_VALUE,
  estimateEmbedHeight,
  getPublicRenderOptions,
  parseEmbedTheme,
  shouldBootstrapAuth,
  shouldTrackEmbedAnalytics,
} from '@/lib/embed';

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

describe('shouldBootstrapAuth', () => {
  it('skips auth bootstrap for embed pages', () => {
    expect(shouldBootstrapAuth('?embed=1')).toBe(false);
  });

  it('keeps auth bootstrap for regular pages', () => {
    expect(shouldBootstrapAuth('')).toBe(true);
    expect(shouldBootstrapAuth('?theme=dark')).toBe(true);
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
