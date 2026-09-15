import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListPreview } from '@/components/list-preview';
import { DEFAULT_DRAFT_BRANDING } from '@/lib/list-branding';

describe('ListPreview', () => {
  it('renders a stable default preview with fallback content', () => {
    const markup = renderToStaticMarkup(
      <ListPreview
        slug=""
        description=""
        branding={DEFAULT_DRAFT_BRANDING}
        links={[]}
      />,
    );

    expect(markup).toContain('Desktop');
    expect(markup).toContain('your-list');
    expect(markup).toContain('Preview link');
  });

  it('renders custom public branding in the preview', () => {
    const markup = renderToStaticMarkup(
      <ListPreview
        slug="my-list"
        description="A carefully curated reading list."
        branding={{
          ...DEFAULT_DRAFT_BRANDING,
          publicTitle: 'Reading queue',
          coverImageUrl: 'https://cdn.example.com/cover.png',
          appearance: {
            ...DEFAULT_DRAFT_BRANDING.appearance,
            layout: 'cards',
            theme: 'ocean',
          },
        }}
        links={[
          {
            id: 'link-1',
            url: 'https://example.com/article',
            position: 0,
            pinned: false,
            ogTitle: 'Great article',
            ogDescription: 'Why careful curation matters.',
            ogImage: null,
            ogSiteName: null,
          },
        ]}
      />,
    );

    expect(markup).toContain('Reading queue');
    expect(markup).toContain('A carefully curated reading list.');
    expect(markup).toContain('Great article');
  });
});
