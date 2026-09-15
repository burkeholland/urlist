import { ImageResponse } from 'next/og';
import { getListWithLinks, resolveSlug } from '@/lib/rtdb';
import {
  getBrandStyleVars,
  getPublicListDescription,
  getPublicListTitle,
} from '@/lib/list-branding';

export const alt = 'Urlist sharing preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

interface ImageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function OpenGraphImage({ params }: ImageProps) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join('/');
  const listId = await resolveSlug(slug);
  const list = listId ? await getListWithLinks(listId) : null;

  const appearance = list?.branding.appearance ?? {
    theme: 'default',
    accent: 'coral',
    layout: 'comfortable',
  };
  const styleVars = getBrandStyleVars(appearance);
  const accent = styleVars['--list-accent'];
  const accentSoft = styleVars['--list-accent-soft'];
  const heroText = styleVars['--list-hero-text'];
  const heroMuted = styleVars['--list-hero-muted'];
  const heroGradient = styleVars['--list-hero-gradient'];

  const title = list
    ? getPublicListTitle(slug, list.branding)
    : slug;
  const description = list
    ? getPublicListDescription(list.description, list.links.length, list.branding)
    : 'Create curated link collections with rich previews.';

  return new ImageResponse(
    (
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
            {list ? `${list.links.length} saved link${list.links.length === 1 ? '' : 's'}` : 'Shareable link collection'}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
