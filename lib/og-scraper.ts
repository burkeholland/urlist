import ogs from 'open-graph-scraper';
import { OgMetadata } from './types';
import { isValidHttpUrl } from './url';
import { log } from './logger';
import { validateUrlNotPrivate } from '@/lib/network';

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

  // SSRF check
  const ssrfCheck = await validateUrlNotPrivate(url);
  if (!ssrfCheck.safe) {
    log({ level: 'warn', message: `SSRF blocked: ${url}`, service: 'og-scraper', data: { error: ssrfCheck.error } });
    return nullResult;
  }

  try {
    const { result } = await ogs({
      url,
      timeout: 5,
    });

    const ogImage = Array.isArray(result.ogImage) ? result.ogImage[0]?.url ?? null : null;

    return {
      url,
      ogTitle: sanitizeText(result.ogTitle, MAX_OG_TITLE_LENGTH),
      ogDescription: sanitizeText(result.ogDescription, MAX_OG_DESCRIPTION_LENGTH),
      ogImage: ogImage && isValidHttpUrl(ogImage) ? ogImage : null,
      ogSiteName: sanitizeText(result.ogSiteName, MAX_OG_SITE_NAME_LENGTH),
    };
  } catch (error) {
    log({
      level: 'warn',
      message: `OG scrape failed for ${url}`,
      service: 'og-scraper',
      data: { error: String(error) },
    });
    return nullResult;
  }
}
