import dns from 'dns/promises';
import net from 'net';

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

const IPV4_MAPPED_IPV6_PREFIX = /^::ffff:/i;

export type UrlSafetyReason = 'private_ip' | 'dns_error' | 'invalid_url';

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_RANGES.some((r) => r.test(ip));
  }
  if (PRIVATE_IPV6_RANGES.some((r) => r.test(ip))) return true;
  if (IPV4_MAPPED_IPV6_PREFIX.test(ip)) {
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

export async function validateUrlNotPrivate(urlString: string): Promise<{
  safe: boolean;
  reason?: UrlSafetyReason;
  error?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'invalid_url', error: 'URL could not be parsed.' };
  }

  const hostname = parsed.hostname.replace(/^\[(.*)\]$/, '$1');

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return {
        safe: false,
        reason: 'private_ip',
        error: 'URL resolves to a private/internal IP range.',
      };
    }
    return { safe: true };
  }

  let allAddresses: string[];
  try {
    allAddresses = (await dns.lookup(hostname, { all: true })).map(({ address }) => address);
  } catch {
    return {
      safe: false,
      reason: 'dns_error',
      error: 'URL hostname could not be safely resolved.',
    };
  }

  for (const addr of allAddresses) {
    if (isPrivateIp(addr)) {
      return {
        safe: false,
        reason: 'private_ip',
        error: 'URL resolves to a private/internal IP range.',
      };
    }
  }

  return { safe: true };
}
