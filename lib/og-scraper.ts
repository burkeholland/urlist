import ogs from 'open-graph-scraper';
import { OgMetadata } from './types';
import { isValidHttpUrl } from './url';
import { log } from './logger';
import { fetchWithSafeRedirects } from '@/lib/network';

import { sanitizeText, MAX_OG_TITLE_LENGTH, MAX_OG_DESCRIPTION_LENGTH, MAX_OG_SITE_NAME_LENGTH } from '@/lib/schemas/shared';

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

  try {
    const { url: resolvedUrl } = await fetchWithSafeRedirects(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });

    const { result } = await ogs({
      url: resolvedUrl,
      timeout: 5,
      fetchOptions: {
        redirect: 'error',
      },
    });

    const ogImage = Array.isArray(result.ogImage) ? result.ogImage[0]?.url ?? null : null;

    return {
      url: resolvedUrl,
      ogTitle: sanitizeText(result.ogTitle, MAX_OG_TITLE_LENGTH),
      ogDescription: sanitizeText(result.ogDescription, MAX_OG_DESCRIPTION_LENGTH),
      ogImage: ogImage && isValidHttpUrl(ogImage) ? ogImage : null,
      ogSiteName: sanitizeText(result.ogSiteName, MAX_OG_SITE_NAME_LENGTH),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('private/internal IP range')) {
      log({ level: 'warn', message: `SSRF blocked: ${url}`, service: 'og-scraper', data: { error: error.message } });
      return nullResult;
    }
    log({
      level: 'warn',
      message: `OG scrape failed for ${url}`,
      service: 'og-scraper',
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return nullResult;
  }
}
