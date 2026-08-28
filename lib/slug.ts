import { nanoid } from 'nanoid';

const SLUG_REGEX = /^[a-z0-9]([a-z0-9\-_\/]*[a-z0-9])?$/;
const CONSECUTIVE_SLASH_REGEX = /\/{2,}/;
const RESERVED_PREFIXES = ['app', 'api', '_next'];

export function validateSlugFormat(slug: string): {
  valid: boolean;
  error?: string;
} {
  if (slug.length === 0) return { valid: true }; // empty = auto-generate
  if (slug.length > 200) {
    return { valid: false, error: 'Slug must be 200 characters or fewer.' };
  }
  const lower = slug.toLowerCase();
  if (lower !== slug) {
    return { valid: false, error: 'Slug must be lowercase.' };
  }
  if (!SLUG_REGEX.test(slug)) {
    return { valid: false, error: 'Slug contains invalid characters.' };
  }
  if (CONSECUTIVE_SLASH_REGEX.test(slug)) {
    return { valid: false, error: 'Slug must not contain consecutive slashes.' };
  }
  const firstSegment = slug.split('/')[0];
  if (RESERVED_PREFIXES.includes(firstSegment)) {
    return { valid: false, error: `"${firstSegment}" is a reserved path.` };
  }
  return { valid: true };
}

// Encode slug for use as RTDB key (/ -> ~)
export function encodeSlugForKey(slug: string): string {
  return slug.replace(/\//g, '~');
}

// Generate an 8-character URL-safe auto-slug
export function generateSlug(): string {
  return nanoid(8).toLowerCase();
}

// Generate a 12-character list ID
export function generateListId(): string {
  return nanoid(12);
}

// Generate a link ID
export function generateLinkId(): string {
  return nanoid(10);
}
