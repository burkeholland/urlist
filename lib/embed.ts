export const EMBED_QUERY_VALUE = '1';
export const EMBED_RESIZE_MESSAGE_TYPE = 'urlist:embed:resize';
export const EMBED_THEMES = ['system', 'light', 'dark'] as const;

export type EmbedTheme = (typeof EMBED_THEMES)[number];

export interface PublicRenderOptions {
  isEmbed: boolean;
  isPreview: boolean;
  theme: EmbedTheme;
}

export function getFirstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseEmbedTheme(value: string | undefined): EmbedTheme {
  return EMBED_THEMES.includes(value as EmbedTheme) ? (value as EmbedTheme) : 'system';
}

export function getPublicRenderOptions(searchParams: {
  [key: string]: string | string[] | undefined;
}): PublicRenderOptions {
  return {
    isEmbed: getFirstSearchParam(searchParams.embed) === EMBED_QUERY_VALUE,
    isPreview: getFirstSearchParam(searchParams.preview) === EMBED_QUERY_VALUE,
    theme: parseEmbedTheme(getFirstSearchParam(searchParams.theme)),
  };
}

export function shouldBootstrapAuth(search: string): boolean {
  return new URLSearchParams(search).get('embed') !== EMBED_QUERY_VALUE;
}

export function shouldTrackEmbedAnalytics(options: PublicRenderOptions): boolean {
  return !(options.isEmbed && options.isPreview);
}

export function buildEmbedUrl(
  publicUrl: string,
  theme: EmbedTheme,
  options: { preview?: boolean } = {},
): string {
  const url = new URL(publicUrl);
  url.searchParams.set('embed', EMBED_QUERY_VALUE);
  url.searchParams.set('theme', theme);

  if (options.preview) {
    url.searchParams.set('preview', EMBED_QUERY_VALUE);
  } else {
    url.searchParams.delete('preview');
  }

  return url.toString();
}

export function estimateEmbedHeight(linkCount: number): number {
  return Math.min(880, Math.max(320, 196 + linkCount * 96));
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createEmbedCode(params: {
  publicUrl: string;
  slug: string;
  theme: EmbedTheme;
  initialHeight: number;
}): string {
  const src = buildEmbedUrl(params.publicUrl, params.theme);
  const url = new URL(src);
  const expectedOrigin = url.origin;
  const title = escapeAttribute(`Urlist embed for /${params.slug}`);
  const initialHeight = Math.max(320, Math.min(880, Math.round(params.initialHeight)));

  return `<iframe
  src="${escapeAttribute(src)}"
  title="${title}"
  loading="lazy"
  style="width:100%;height:${initialHeight}px;border:0;border-radius:12px;overflow:hidden"
  referrerpolicy="strict-origin-when-cross-origin"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
></iframe>
<script>
  (() => {
    const iframe = document.currentScript?.previousElementSibling;
    if (!(iframe instanceof HTMLIFrameElement)) return;
    const minHeight = 320;
    const maxHeight = 880;
    window.addEventListener('message', (event) => {
      if (event.origin !== ${JSON.stringify(expectedOrigin)}) return;
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || event.data.type !== '${EMBED_RESIZE_MESSAGE_TYPE}') return;
      const height = Number(event.data.height);
      if (!Number.isFinite(height)) return;
      iframe.style.height = \`\${Math.min(maxHeight, Math.max(minHeight, Math.ceil(height)))}px\`;
    });
  })();
</script>`;
}
