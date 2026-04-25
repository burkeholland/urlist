import ogs from 'open-graph-scraper';
import { OgMetadata } from './types';
import { isValidHttpUrl } from './url';
import dns from 'dns/promises';
import net from 'net';
import { log } from './logger';

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
];

const PRIVATE_IPV6_RANGES = [
  /^::1$/,
  /^::$/,
  /^::ffff:(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/i,
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_RANGES.some((r) => r.test(ip));
  }
  if (net.isIPv6(ip)) {
    return PRIVATE_IPV6_RANGES.some((r) => r.test(ip));
  }
  return false;
}

async function validateUrlNotPrivate(urlString: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const parsed = new URL(urlString);
    // Strip brackets from IPv6 literals (URL parser wraps them: "[::1]" -> "::1")
    const hostname = parsed.hostname.replace(/^\[(.*)\]$/, '$1');

    // Check if hostname is already an IP address
    if (net.isIP(hostname)) {
      if (isPrivateIp(hostname)) {
        return { safe: false, error: 'URL resolves to a private/internal IP range.' };
      }
      return { safe: true };
    }

    // Resolve hostname and check all addresses
    const allAddresses: string[] = [];
    try {
      allAddresses.push(...(await dns.resolve4(hostname)));
    } catch { /* no A records */ }
    try {
      allAddresses.push(...(await dns.resolve6(hostname)));
    } catch { /* no AAAA records */ }

    // Fail closed: if DNS can't resolve, block rather than allow
    if (allAddresses.length === 0) {
      return { safe: false, error: 'URL hostname could not be safely resolved.' };
    }

    for (const addr of allAddresses) {
      if (isPrivateIp(addr)) {
        return { safe: false, error: 'URL resolves to a private/internal IP range.' };
      }
    }

    return { safe: true };
  } catch {
    return { safe: false, error: 'Invalid URL.' };
  }
}

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
