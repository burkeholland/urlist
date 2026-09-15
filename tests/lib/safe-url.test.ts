import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { isPrivateIp, validateUrlNotPrivate } from '@/lib/safe-url';

vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn(),
  },
}));

describe('safe-url', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('blocks private and otherwise non-public IPv4 ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('169.254.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('192.168.0.1')).toBe(true);
    expect(isPrivateIp('198.18.0.1')).toBe(true);
    expect(isPrivateIp('203.0.113.1')).toBe(true);
    expect(isPrivateIp('224.0.0.1')).toBe(true);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
  });

  it('blocks restricted IPv6 and IPv4-mapped IPv6 addresses', () => {
    expect(isPrivateIp('::')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd12::1')).toBe(true);
    expect(isPrivateIp('ff00::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateIp('::ffff:93.184.216.34')).toBe(false);
    expect(isPrivateIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('returns the public addresses that must be used for the outbound connection', async () => {
    const result = await validateUrlNotPrivate('https://example.com/path');

    expect(result).toEqual({ safe: true, addresses: ['93.184.216.34'] });
  });

  it('fails closed when any DNS answer is non-public', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);

    const result = await validateUrlNotPrivate('https://example.com/path');

    expect(result).toMatchObject({ safe: false, reason: 'private_ip' });
  });

  it('rejects non-http protocols before DNS resolution', async () => {
    const dns = await import('dns/promises');

    const result = await validateUrlNotPrivate('file:///etc/passwd');

    expect(result).toMatchObject({ safe: false, reason: 'invalid_url' });
    expect(dns.default.lookup).not.toHaveBeenCalled();
  });
});
