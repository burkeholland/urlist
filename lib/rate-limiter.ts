import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

interface RateLimitConfig {
  endpoint: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  publishAnonymous: { endpoint: 'publish-anon', limit: 10, windowSeconds: 3600 },
  publishAuthenticated: { endpoint: 'publish-auth', limit: 100, windowSeconds: 3600 },
  ogScrape: { endpoint: 'og-scrape', limit: 60, windowSeconds: 3600 },
  slugCheck: { endpoint: 'slug-check', limit: 120, windowSeconds: 3600 },
  validationError: { endpoint: 'validation-error', limit: 60, windowSeconds: 3600 },
} satisfies Record<string, RateLimitConfig>;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function getWindowKey(windowSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSeconds);
  return String(window);
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return '0.0.0.0';
}

/**
 * In-memory rate limiter. NOT suitable for multi-instance deployments —
 * each server instance maintains its own counters. For production at scale,
 * replace with a distributed store (Redis, Upstash, etc.).
 */

// In-memory store: key -> { count, windowKey, createdAt }
const store = new Map<string, { count: number; windowKey: string; createdAt: number }>();

// Periodic cleanup every 5 minutes
export function _sweepStaleEntries(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, entry] of store) {
    // Remove entries older than 2 hours regardless of window size
    if (now - entry.createdAt > 7200) {
      store.delete(key);
    }
  }
}

setInterval(_sweepStaleEntries, 5 * 60 * 1000).unref();

export async function checkRateLimit(
  ip: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const ipHash = hashIp(ip);
  const windowKey = getWindowKey(config.windowSeconds);
  const storeKey = config.endpoint + ':' + ipHash + ':' + windowKey;

  const entry = store.get(storeKey);
  if (entry && entry.windowKey === windowKey) {
    if (entry.count >= config.limit) {
      return { allowed: false, retryAfter: config.windowSeconds };
    }
    entry.count++;
    return { allowed: true };
  }

  store.set(storeKey, { count: 1, windowKey, createdAt: Math.floor(Date.now() / 1000) });
  return { allowed: true };
}
