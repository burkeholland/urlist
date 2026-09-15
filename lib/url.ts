import { MAX_URL_LENGTH } from '@/lib/schemas/shared';

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'file:', 'mailto:', 'ftp:', 'blob:'];
const BARE_DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/;
const SENSITIVE_CAPTURE_QUERY_KEYS = new Set([
  'access_token',
  'auth_token',
  'id_token',
  'key-pair-id',
  'password',
  'passwd',
  'pwd',
  'refresh_token',
  'secret',
  'session_token',
  'sessionid',
  'sig',
  'signature',
  'token',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature',
  'x-goog-credential',
  'x-goog-security-token',
  'x-goog-signature',
]);
const OAUTH_CODE_COMPANION_KEYS = new Set(['client_id', 'redirect_uri', 'scope', 'state']);

export function normalizeUrl(input: string): {
  url: string;
  valid: boolean;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { url: '', valid: false, error: 'URL is required.' };

  if (trimmed.length > MAX_URL_LENGTH) {
    return { url: '', valid: false, error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters.` };
  }

  for (const proto of BLOCKED_PROTOCOLS) {
    if (trimmed.toLowerCase().startsWith(proto)) {
      return { url: '', valid: false, error: `"${proto}" URLs are not allowed.` };
    }
  }

  let urlString = trimmed;
  if (!trimmed.includes('://')) {
    if (BARE_DOMAIN_REGEX.test(trimmed)) {
      urlString = `https://${trimmed}`;
    } else {
      return { url: '', valid: false, error: 'Invalid URL format.' };
    }
  }

  try {
    const parsed = new URL(urlString);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return { url: '', valid: false, error: 'Only http and https URLs are allowed.' };
    }
    return { url: parsed.href, valid: true };
  } catch {
    return { url: '', valid: false, error: 'Invalid URL format.' };
  }
}

export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function hasSensitiveCaptureQueryParams(parsed: URL): boolean {
  const keys = [...parsed.searchParams.keys()].map((key) => key.toLowerCase());

  if (keys.some((key) => SENSITIVE_CAPTURE_QUERY_KEYS.has(key))) {
    return true;
  }

  return keys.includes('code') && keys.some((key) => OAUTH_CODE_COMPANION_KEYS.has(key));
}

export function normalizeCapturedUrl(input: string): {
  url: string;
  valid: boolean;
  error?: string;
} {
  const normalized = normalizeUrl(input);
  if (!normalized.valid) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized.url);

    if (parsed.username || parsed.password) {
      return {
        url: '',
        valid: false,
        error: 'URLs with embedded credentials are not allowed.',
      };
    }

    if (hasSensitiveCaptureQueryParams(parsed)) {
      return {
        url: '',
        valid: false,
        error: 'URLs with sensitive tokens or signed parameters cannot be quick-captured.',
      };
    }

    parsed.hash = '';
    return { url: parsed.href, valid: true };
  } catch {
    return { url: '', valid: false, error: 'Invalid URL format.' };
  }
}
