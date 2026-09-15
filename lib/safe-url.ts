import dns from 'dns/promises';
import net from 'net';

const RESTRICTED_IPV4_CIDRS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const restrictedIpv6 = new net.BlockList();
restrictedIpv6.addSubnet('::', 128, 'ipv6');
restrictedIpv6.addSubnet('::1', 128, 'ipv6');
restrictedIpv6.addSubnet('64:ff9b:1::', 48, 'ipv6');
restrictedIpv6.addSubnet('100::', 64, 'ipv6');
restrictedIpv6.addSubnet('2001::', 23, 'ipv6');
restrictedIpv6.addSubnet('2001:db8::', 32, 'ipv6');
restrictedIpv6.addSubnet('2002::', 16, 'ipv6');
restrictedIpv6.addSubnet('fc00::', 7, 'ipv6');
restrictedIpv6.addSubnet('fe80::', 10, 'ipv6');
restrictedIpv6.addSubnet('ff00::', 8, 'ipv6');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const IPV4_MAPPED_IPV6_PREFIX = /^::ffff:/i;

export type UrlSafetyReason = 'private_ip' | 'dns_error' | 'invalid_url';

function ipv4ToNumber(ip: string): number | null {
  const octets = ip.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return octets.reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
}

function ipv4InCidr(ip: string, base: string, prefix: number): boolean {
  const ipNumber = ipv4ToNumber(ip);
  const baseNumber = ipv4ToNumber(base);
  if (ipNumber === null || baseNumber === null) return true;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNumber & mask) === (baseNumber & mask);
}

function mappedIpv4(ip: string): string | null {
  if (!IPV4_MAPPED_IPV6_PREFIX.test(ip)) return null;
  const suffix = ip.replace(IPV4_MAPPED_IPV6_PREFIX, '');
  if (net.isIPv4(suffix)) return suffix;

  const groups = suffix.split(':');
  if (groups.length !== 2) return null;
  const parts = groups.map((group) => parseInt(group, 16));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) {
    return null;
  }
  return [
    (parts[0] >> 8) & 0xff,
    parts[0] & 0xff,
    (parts[1] >> 8) & 0xff,
    parts[1] & 0xff,
  ].join('.');
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return RESTRICTED_IPV4_CIDRS.some(([base, prefix]) => ipv4InCidr(ip, base, prefix));
  }
  if (net.isIPv6(ip)) {
    const ipv4 = mappedIpv4(ip);
    if (ipv4) return isPrivateIp(ipv4);
    return restrictedIpv6.check(ip, 'ipv6');
  }
  return false;
}

export async function validateUrlNotPrivate(urlString: string): Promise<{
  safe: boolean;
  reason?: UrlSafetyReason;
  error?: string;
  addresses?: string[];
}> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'invalid_url', error: 'URL could not be parsed.' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { safe: false, reason: 'invalid_url', error: 'Only http and https URLs are allowed.' };
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
    return { safe: true, addresses: [hostname] };
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

  return { safe: true, addresses: allAddresses };
}
