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
  /^fc00:/i,
  /^fd/i,
  /^fe80:/i,
];

// WHATWG URL parsing normalizes IPv4-mapped IPv6 literals ([::ffff:10.0.0.1])
// to hex-group form ([::ffff:a00:1]), so match the normalized form too.
const IPV4_MAPPED_IPV6_PREFIX = /^::ffff:/i;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_RANGES.some((r) => r.test(ip));
  }
  if (PRIVATE_IPV6_RANGES.some((r) => r.test(ip))) return true;
  if (IPV4_MAPPED_IPV6_PREFIX.test(ip)) {
    // Recover the embedded IPv4 from the trailing hex groups (a00:1 → 10.0.0.1)
    const groups = ip.replace(IPV4_MAPPED_IPV6_PREFIX, '').split(':');
    const octets = groups.flatMap((g) => {
      const n = parseInt(g, 16);
      return [(n >> 8) & 0xff, n & 0xff];
    });
    const ipv4 = octets.slice(-4).join('.');
    return PRIVATE_IPV4_RANGES.some((r) => r.test(ipv4));
  }
  return false;
}

async function validateUrlNotPrivate(urlString: string): Promise<{ safe: boolean; error?: string }> {
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

  // Resolve hostname using the OS resolver path Node uses for outbound connections.
  let allAddresses: string[];
  try {
    allAddresses = (await dns.lookup(hostname, { all: true })).map(({ address }) => address);
  } catch {
    // Fail closed: if DNS can't resolve, block rather than allow
    return { safe: false, error: 'URL hostname could not be safely resolved.' };
  }

  for (const addr of allAddresses) {
    if (isPrivateIp(addr)) {
      return { safe: false, error: 'URL resolves to a private/internal IP range.' };
    }
  }

  return { safe: true };
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
