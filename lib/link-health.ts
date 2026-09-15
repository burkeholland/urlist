import { setTimeout as delay } from 'timers/promises';
import { log } from './logger';
import { validateUrlNotPrivate } from './safe-url';
import { isValidHttpUrl } from './url';
import type {
  LinkHealthReason,
  LinkHealthStatus,
  LinkWithId,
  MetadataRefreshStatus,
  OgMetadata,
} from './types';
import {
  MAX_OG_DESCRIPTION_LENGTH,
  MAX_OG_SITE_NAME_LENGTH,
  MAX_OG_TITLE_LENGTH,
  sanitizeText,
} from './schemas/shared';

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 256 * 1024;
const RETRY_DELAYS_MS = [0, 100, 300] as const;
const TRANSIENT_RECHECK_MS = 6 * 60 * 60 * 1000;
const HEALTHY_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const BROKEN_RECHECK_MS = 24 * 60 * 60 * 1000;

type FetchLike = typeof fetch;

export interface LinkHealthCheckOptions {
  fetchImpl?: FetchLike;
  now?: number;
  timeoutMs?: number;
  confirmMetadataOverwrite?: boolean;
  refreshMetadata?: boolean;
}

export interface LinkHealthUpdate {
  healthStatus: LinkHealthStatus;
  healthReason: LinkHealthReason;
  healthCheckedAt: number;
  healthFinalUrl: string | null;
  healthHttpStatus: number | null;
  healthFailureCount: number;
  healthNextCheckAt: number;
  metadataRefreshedAt: number | null;
  metadataRefreshStatus: MetadataRefreshStatus;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogSiteName?: string | null;
}

interface FetchAttemptResult {
  response: Response;
  finalUrl: string;
  redirected: boolean;
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function classifyHttpStatus(status: number, redirected: boolean): {
  status: LinkHealthStatus;
  reason: LinkHealthReason;
} {
  if (status >= 200 && status < 400) {
    return redirected
      ? { status: 'redirected', reason: 'redirect' }
      : { status: 'healthy', reason: 'ok' };
  }
  if (status === 404) return { status: 'broken', reason: 'http_404' };
  if (status === 410) return { status: 'broken', reason: 'http_410' };
  if (isTransientStatus(status)) return { status: 'transient', reason: 'http_5xx' };
  return { status: 'broken', reason: 'network_error' };
}

function nextCheckAt(now: number, status: LinkHealthStatus, failureCount: number): number {
  if (status === 'healthy' || status === 'redirected') return now + HEALTHY_RECHECK_MS;
  if (status === 'transient') return now + Math.min(24 * 60 * 60 * 1000, TRANSIENT_RECHECK_MS * failureCount);
  return now + BROKEN_RECHECK_MS;
}

function getMeta(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseMetadata(url: string, html: string): OgMetadata {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const image = getMeta(html, 'og:image');
  return {
    url,
    ogTitle: sanitizeText(getMeta(html, 'og:title') ?? titleMatch?.[1], MAX_OG_TITLE_LENGTH),
    ogDescription: sanitizeText(
      getMeta(html, 'og:description') ?? getMeta(html, 'description'),
      MAX_OG_DESCRIPTION_LENGTH,
    ),
    ogImage: image && isValidHttpUrl(image) ? image : null,
    ogSiteName: sanitizeText(getMeta(html, 'og:site_name'), MAX_OG_SITE_NAME_LENGTH),
  };
}

async function safeFetchWithRedirects(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<FetchAttemptResult> {
  let currentUrl = url;
  let redirected = false;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safety = await validateUrlNotPrivate(currentUrl);
    if (!safety.safe) {
      const error = new Error(safety.error ?? 'URL failed SSRF safety validation.') as Error & {
        healthReason?: LinkHealthReason;
      };
      error.healthReason = safety.reason === 'dns_error' ? 'dns_error' : 'ssrf_blocked';
      throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Urlist-LinkHealth/1.0',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, finalUrl: currentUrl, redirected };
      currentUrl = new URL(location, currentUrl).href;
      if (!isValidHttpUrl(currentUrl)) {
        const error = new Error('Redirect target is not an http(s) URL.') as Error & {
          healthReason?: LinkHealthReason;
        };
        error.healthReason = 'ssrf_blocked';
        throw error;
      }
      redirected = true;
      continue;
    }

    return { response, finalUrl: currentUrl, redirected };
  }

  const error = new Error('Too many redirects.') as Error & { healthReason?: LinkHealthReason };
  error.healthReason = 'too_many_redirects';
  throw error;
}

async function readHtml(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) return null;
  const text = await response.text();
  return text.slice(0, MAX_HTML_BYTES);
}

function mergeMetadata(
  link: LinkWithId,
  metadata: OgMetadata | null,
  confirmOverwrite: boolean,
): {
  updates: Pick<LinkHealthUpdate, 'ogTitle' | 'ogDescription' | 'ogImage' | 'ogSiteName'>;
  status: MetadataRefreshStatus;
} {
  if (!metadata) return { updates: {}, status: 'failed' };

  const updates: Pick<LinkHealthUpdate, 'ogTitle' | 'ogDescription' | 'ogImage' | 'ogSiteName'> = {};
  const maybeSet = (
    key: keyof typeof updates,
    current: string | null,
    next: string | null,
    protectedByOwnerEdit: boolean,
  ) => {
    if (next === null) return;
    if ((confirmOverwrite || !protectedByOwnerEdit || current === null) && current !== next) {
      updates[key] = next;
    }
  };

  const protectLegacyTitle = link.ogTitleUserEdited ?? link.ogTitle !== null;
  const protectLegacyDescription = link.ogDescriptionUserEdited ?? link.ogDescription !== null;
  maybeSet('ogTitle', link.ogTitle, metadata.ogTitle, protectLegacyTitle);
  maybeSet('ogDescription', link.ogDescription, metadata.ogDescription, protectLegacyDescription);
  maybeSet('ogImage', link.ogImage, metadata.ogImage, false);
  maybeSet('ogSiteName', link.ogSiteName, metadata.ogSiteName, false);

  return {
    updates,
    status: Object.keys(updates).length > 0 ? 'updated' : 'unchanged',
  };
}

export async function checkLinkHealth(
  link: LinkWithId,
  options: LinkHealthCheckOptions = {},
): Promise<LinkHealthUpdate> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const refreshMetadata = options.refreshMetadata ?? true;

  let lastErrorReason: LinkHealthReason = 'network_error';
  let lastHttpStatus: number | null = null;
  let finalUrl: string | null = null;
  let redirected = false;
  let response: Response | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const wait = RETRY_DELAYS_MS[attempt];
    if (wait > 0) await delay(wait);
    try {
      const result = await safeFetchWithRedirects(link.url, fetchImpl, timeoutMs);
      response = result.response;
      finalUrl = result.finalUrl;
      redirected = result.redirected;
      lastHttpStatus = response.status;
      if (!isTransientStatus(response.status)) break;
      lastErrorReason = 'http_5xx';
    } catch (error) {
      const typedError = error as Error & { healthReason?: LinkHealthReason; name?: string };
      lastErrorReason =
        typedError.healthReason ??
        (typedError.name === 'AbortError' ? 'timeout' : 'network_error');
      if (lastErrorReason === 'ssrf_blocked' || lastErrorReason === 'dns_error') break;
      log({
        level: 'warn',
        message: 'Link health check attempt failed',
        service: 'link-health',
        data: { linkId: link.id, url: link.url, attempt: attempt + 1, error: String(error) },
      });
    }
  }

  const previousFailureCount = link.healthFailureCount ?? 0;
  let healthStatus: LinkHealthStatus;
  let healthReason: LinkHealthReason;

  if (response) {
    const classification = classifyHttpStatus(response.status, redirected);
    healthStatus = classification.status;
    healthReason = classification.reason;
  } else if (lastErrorReason === 'dns_error' || lastErrorReason === 'ssrf_blocked' || lastErrorReason === 'too_many_redirects') {
    healthStatus = 'broken';
    healthReason = lastErrorReason;
  } else if (lastErrorReason === 'timeout') {
    healthStatus = 'broken';
    healthReason = 'repeated_timeout';
  } else {
    healthStatus = 'transient';
    healthReason = lastErrorReason;
  }

  const failureCount =
    healthStatus === 'healthy' || healthStatus === 'redirected' ? 0 : previousFailureCount + 1;

  let metadata: OgMetadata | null = null;
  if (response && refreshMetadata && response.status >= 200 && response.status < 400) {
    const html = await readHtml(response);
    metadata = html ? parseMetadata(finalUrl ?? link.url, html) : null;
  }

  const metadataMerge = mergeMetadata(
    link,
    metadata,
    options.confirmMetadataOverwrite ?? false,
  );

  return {
    healthStatus,
    healthReason,
    healthCheckedAt: now,
    healthFinalUrl: finalUrl,
    healthHttpStatus: lastHttpStatus,
    healthFailureCount: failureCount,
    healthNextCheckAt: nextCheckAt(now, healthStatus, Math.max(1, failureCount)),
    metadataRefreshedAt: refreshMetadata ? now : null,
    metadataRefreshStatus: refreshMetadata ? metadataMerge.status : 'skipped',
    ...metadataMerge.updates,
  };
}

export function buildDismissedHealthUpdate(now = Date.now()): Partial<LinkHealthUpdate> & {
  healthStatus: LinkHealthStatus;
  healthReason: LinkHealthReason;
  healthDismissedAt: number;
} {
  return {
    healthStatus: 'dismissed',
    healthReason: 'dismissed',
    healthDismissedAt: now,
    healthNextCheckAt: now + HEALTHY_RECHECK_MS,
    metadataRefreshStatus: 'skipped',
  };
}
