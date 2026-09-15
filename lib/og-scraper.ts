import { checkLinkHealth } from './link-health';
import { log } from './logger';
import type { LinkWithId, OgMetadata } from './types';
import { isValidHttpUrl } from './url';

export async function scrapeOgMetadata(url: string): Promise<OgMetadata> {
  const nullResult: OgMetadata = {
    url,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    ogSiteName: null,
  };

  if (!isValidHttpUrl(url)) {
    return nullResult;
  }

  const link: LinkWithId = {
    id: 'og-scrape',
    url,
    position: 0,
    pinned: false,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    ogSiteName: null,
    ogTitleUserEdited: false,
    ogDescriptionUserEdited: false,
    createdAt: Date.now(),
    healthFailureCount: 0,
  };

  const result = await checkLinkHealth(link, { refreshMetadata: true });
  if (result.healthReason === 'ssrf_blocked' || result.healthReason === 'dns_error') {
    log({
      level: 'warn',
      message: `SSRF blocked: ${url}`,
      service: 'og-scraper',
      data: {
        error: result.healthReason === 'dns_error'
          ? 'URL hostname could not be safely resolved.'
          : 'URL resolves to a private/internal IP range.',
      },
    });
  } else if (result.metadataRefreshStatus === 'failed') {
    log({
      level: 'warn',
      message: `OG scrape failed for ${url}`,
      service: 'og-scraper',
      data: { error: result.healthReason },
    });
  }

  return {
    url,
    ogTitle: result.ogTitle ?? null,
    ogDescription: result.ogDescription ?? null,
    ogImage: result.ogImage ?? null,
    ogSiteName: result.ogSiteName ?? null,
  };
}
