import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavHeader } from '@/components/nav-header';
import { AuthProvider } from '@/hooks/use-auth';

describe('NavHeader', () => {
  it('raises the header stacking context above compose content but below modal overlays', () => {
    const markup = renderToStaticMarkup(
      <AuthProvider>
        <NavHeader />
      </AuthProvider>
    );
    const header = markup.match(/<header\b[^>]*>/)?.[0];

    // The backdrop filter traps dropdown z-index values inside the header.
    expect(header).toContain('position:relative');
    const zIndex = Number(header?.match(/z-index:(\d+)/)?.[1]);
    expect(zIndex).toBeGreaterThan(0);
    expect(zIndex).toBeLessThan(50);
  });
});
