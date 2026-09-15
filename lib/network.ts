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

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_RANGES.some((range) => range.test(ip));
  }
  if (PRIVATE_IPV6_RANGES.some((range) => range.test(ip))) {
    return true;
  }
  if (IPV4_MAPPED_IPV6_PREFIX.test(ip)) {
    const groups = ip.replace(IPV4_MAPPED_IPV6_PREFIX, '').split(':');
    const octets = groups.flatMap((group) => {
      const value = parseInt(group, 16);
      return [(value >> 8) & 0xff, value & 0xff];
    });
    const ipv4 = octets.slice(-4).join('.');
    return PRIVATE_IPV4_RANGES.some((range) => range.test(ipv4));
  }
  return false;
}

export async function validateUrlNotPrivate(
  urlString: string,
): Promise<{ safe: boolean; error?: string }> {
  const parsed = new URL(urlString);
  const hostname = parsed.hostname.replace(/^\[(.*)\]$/, '$1');

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, error: 'URL resolves to a private/internal IP range.' };
    }
    return { safe: true };
  }

  let allAddresses: string[];
  try {
    allAddresses = (await dns.lookup(hostname, { all: true })).map(({ address }) => address);
  } catch {
    return { safe: false, error: 'URL hostname could not be safely resolved.' };
  }

  for (const address of allAddresses) {
    if (isPrivateIp(address)) {
      return { safe: false, error: 'URL resolves to a private/internal IP range.' };
    }
  }

  return { safe: true };
}
