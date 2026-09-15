import {
  getBrandStyleVars,
  getPublicListDescription,
  getSocialTitle,
} from '@/lib/list-branding';
import type { ListWithLinks } from '@/lib/types';

export const openGraphImageAlt = 'Urlist sharing preview';
export const openGraphImageSize = {
  width: 1200,
  height: 630,
};
export const openGraphImageContentType = 'image/png';

const DEFAULT_APPEARANCE = {
  theme: 'default',
  accent: 'coral',
  layout: 'comfortable',
} as const;

export function buildOpenGraphImageModel(slug: string, list: ListWithLinks | null) {
  const appearance = list?.branding.appearance ?? DEFAULT_APPEARANCE;
  const styleVars = getBrandStyleVars(appearance);

  return {
    slug,
    title: list ? getSocialTitle(slug, list.branding) : slug,
    description: list
      ? getPublicListDescription(list.description, list.links.length, list.branding)
      : 'Create curated link collections with rich previews.',
    accent: styleVars['--list-accent'],
    accentSoft: styleVars['--list-accent-soft'],
    heroText: styleVars['--list-hero-text'],
    heroMuted: styleVars['--list-hero-muted'],
    heroGradient: styleVars['--list-hero-gradient'],
    linkCount: list?.links.length ?? null,
  };
}

interface OpenGraphImageMarkupProps {
  slug: string;
  title: string;
  description: string;
  accent: string;
  accentSoft: string;
  heroText: string;
  heroMuted: string;
  heroGradient: string;
  linkCount: number | null;
}

export function OpenGraphImageMarkup({
  slug,
  title,
  description,
  accent,
  accentSoft,
  heroText,
  heroMuted,
  heroGradient,
  linkCount,
}: OpenGraphImageMarkupProps) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: heroGradient,
        color: heroText,
        padding: '42px',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: 'Arial',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignSelf: 'flex-start',
          padding: '10px 18px',
          borderRadius: 999,
          background: accentSoft,
          color: heroText,
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        urlist
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: 30, lineHeight: 1.35, color: heroMuted }}>
          {description}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 24, color: heroMuted }}>/{slug}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 24,
            color: heroText,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: accent,
            }}
          />
          {linkCount === null
            ? 'Shareable link collection'
            : `${linkCount} saved link${linkCount === 1 ? '' : 's'}`}
        </div>
      </div>
    </div>
  );
}
