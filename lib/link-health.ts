import { setTimeout as delay } from 'timers/promises';
import http from 'node:http';
import https from 'node:https';
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
const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Urlist-LinkHealth/1.0',
};

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

function responseHeaders(headers: http.IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else {
      result.set(key, value);
    }
  }
  return result;
}

function responseStatus(statusCode?: number): number {
  return statusCode && statusCode >= 200 && statusCode <= 599 ? statusCode : 502;
}

function pinnedRequest(
  url: string,
  address: string,
  timeoutMs: number,
): Promise<Response> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const request = isHttps ? https.request : http.request;
  const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (response: Response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const req = request(
      {
        hostname: address,
        port,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: {
          ...FETCH_HEADERS,
          Host: parsed.host,
        },
        servername: isHttps ? parsed.hostname : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          if (settled) return;
          const remaining = MAX_HTML_BYTES - received;
          if (remaining > 0) {
            chunks.push(chunk.length > remaining ? chunk.subarray(0, remaining) : chunk);
          }
          received += chunk.length;
          if (received >= MAX_HTML_BYTES) {
            finish(new Response(Buffer.concat(chunks), {
              status: responseStatus(res.statusCode),
              headers: responseHeaders(res.headers),
            }));
            req.destroy();
          }
        });
        res.on('end', () => {
          finish(new Response(Buffer.concat(chunks), {
            status: responseStatus(res.statusCode),
            headers: responseHeaders(res.headers),
          }));
        });
        res.on('error', fail);
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(Object.assign(new Error('Request timed out.'), { name: 'AbortError' }));
    });
    req.on('error', fail);
    req.end();
  });
}

async function pinnedFetch(
  url: string,
  addresses: string[],
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await pinnedRequest(url, address, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('URL hostname could not be safely resolved.');
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
  fetchImpl: FetchLike | undefined,
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

    let response: Response;
    if (fetchImpl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetchImpl(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: FETCH_HEADERS,
        });
      } finally {
        clearTimeout(timeout);
      }
    } else {
      response = await pinnedFetch(currentUrl, safety.addresses ?? [], timeoutMs);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, finalUrl: currentUrl, redirected: true };
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
    if ((confirmOverwrite || !protectedByOwnerEdit) && current !== next) {
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
  const fetchImpl = options.fetchImpl;
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
