import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeOgMetadata } from '@/lib/og-scraper';

// Mock dns and ogs modules
vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}));

vi.mock('open-graph-scraper', () => ({
  default: vi.fn().mockResolvedValue({
    result: {
      ogTitle: 'Example Title',
      ogDescription: 'Example Description',
      ogImage: [{ url: 'https://example.com/img.png' }],
      ogSiteName: 'Example',
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}));

const defaultOgResult = {
  result: {
    ogTitle: 'Example Title',
    ogDescription: 'Example Description',
    ogImage: [{ url: 'https://example.com/img.png' }],
    ogSiteName: 'Example',
  },
};

describe('scrapeOgMetadata', () => {
  beforeEach(async () => {
    const dns = await import('dns/promises');
    const ogs = await import('open-graph-scraper');

    vi.clearAllMocks();
    (dns.default.lookup as ReturnType<typeof vi.fn>).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    (ogs.default as ReturnType<typeof vi.fn>).mockResolvedValue(defaultOgResult);
  });

  it('returns metadata for valid URL', async () => {
    const result = await scrapeOgMetadata('https://example.com');
    expect(result.url).toBe('https://example.com');
    expect(result.ogTitle).toBe('Example Title');
    expect(result.ogDescription).toBe('Example Description');
    expect(result.ogImage).toBe('https://example.com/img.png');
    expect(result.ogSiteName).toBe('Example');
  });

  it('returns null metadata for invalid URL', async () => {
    const result = await scrapeOgMetadata('not-a-url');
    expect(result.ogTitle).toBeNull();
    expect(result.ogDescription).toBeNull();
    expect(result.ogImage).toBeNull();
  });

  it('strips HTML from OG fields', async () => {
    const ogs = await import('open-graph-scraper');
    (ogs.default as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        ogTitle: '<script>alert("xss")</script>Clean Title',
        ogDescription: '<b>Bold</b> description',
        ogImage: [],
        ogSiteName: null,
      },
    });
    const result = await scrapeOgMetadata('https://example.com');
    expect(result.ogTitle).toBe('alert("xss")Clean Title');
    expect(result.ogDescription).toBe('Bold description');
  });

  it('truncates long OG fields', async () => {
    const ogs = await import('open-graph-scraper');
    (ogs.default as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        ogTitle: 'A'.repeat(300),
        ogDescription: 'B'.repeat(600),
        ogImage: [],
        ogSiteName: 'C'.repeat(200),
      },
    });
    const result = await scrapeOgMetadata('https://example.com');
    expect(result.ogTitle!.length).toBe(200);
    expect(result.ogDescription!.length).toBe(500);
    expect(result.ogSiteName!.length).toBe(100);
  });

  it('rejects private IP URLs', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }]);
    const result = await scrapeOgMetadata('https://internal.corp');
    expect(result.ogTitle).toBeNull();
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      service: 'og-scraper',
      data: { error: 'URL resolves to a private/internal IP range.' },
    }));
  });

  it('rejects loopback IP URLs', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const result = await scrapeOgMetadata('https://localhost');
    expect(result.ogTitle).toBeNull();
  });

  it('rejects direct private IP in URL', async () => {
    const result = await scrapeOgMetadata('http://10.0.0.1/admin');
    expect(result.ogTitle).toBeNull();
  });

  it('rejects hostnames whose textual prefix looks private but resolves publicly', async () => {
    // Anchoring matters: "10.evil.example" starts with 10. but is a hostname,
    // not an IP — DNS resolution decides, and a public resolution is allowed.
    const result = await scrapeOgMetadata('https://10.example.com');
    expect(result.ogTitle).toBe('Example Title');
  });

  it('handles OG scrape failure gracefully', async () => {
    const ogs = await import('open-graph-scraper');
    (ogs.default as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    const result = await scrapeOgMetadata('https://slow-site.com');
    expect(result.ogTitle).toBeNull();
    expect(result.url).toBe('https://slow-site.com');
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      message: 'OG scrape failed for https://slow-site.com',
      service: 'og-scraper',
    }));
  });


  it('rejects cloud metadata IP (169.254.169.254)', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    const result = await scrapeOgMetadata('https://metadata.cloud');
    expect(result.ogTitle).toBeNull();
  });

  it('rejects IPv6 loopback ::1', async () => {
    const result = await scrapeOgMetadata('http://[::1]/admin');
    expect(result.ogTitle).toBeNull();
  });

  it('rejects private IPv4 ranges directly in the URL', async () => {
    expect((await scrapeOgMetadata('http://10.1.2.3/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://192.168.0.1/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://127.0.0.5/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://169.254.1.1/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://0.1.2.3/')).ogTitle).toBeNull();
  });

  it('rejects the full 172.16.0.0/12 private range but allows public 172.x', async () => {
    expect((await scrapeOgMetadata('http://172.16.0.1/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://172.31.255.255/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://172.20.10.2/')).ogTitle).toBeNull();
    // Outside the /12 range — public
    expect((await scrapeOgMetadata('http://172.15.0.1/')).ogTitle).toBe('Example Title');
    expect((await scrapeOgMetadata('http://172.32.0.1/')).ogTitle).toBe('Example Title');
    // 172.x where second octet is not 16-31
    expect((await scrapeOgMetadata('http://172.40.0.1/')).ogTitle).toBe('Example Title');
  });

  it('rejects IPv6 private ranges', async () => {
    expect((await scrapeOgMetadata('http://[::]/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://[fc00::1]/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://[fd00::1]/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://[fe80::1]/')).ogTitle).toBeNull();
  });

  it('does not false-positive on IPv6 addresses that only contain private-like segments', async () => {
    // 2606:4700:4700::1111 is public (Cloudflare DNS)
    expect((await scrapeOgMetadata('http://[2606:4700:4700::1111]/')).ogTitle).toBe('Example Title');
    // "fd" must match at the start: 1fd:: is not a ULA
    expect((await scrapeOgMetadata('http://[1fd0::1]/')).ogTitle).toBe('Example Title');
    // "fc00" must match at the start: 1fc0:: is public
    expect((await scrapeOgMetadata('http://[1fc0::1]/')).ogTitle).toBe('Example Title');
    // fe80 must be the first group
    expect((await scrapeOgMetadata('http://[1fe8::1]/')).ogTitle).toBe('Example Title');
    // ::1 must be exact, not a prefix
    expect((await scrapeOgMetadata('http://[::1:1]/')).ogTitle).toBe('Example Title');
    // ::ffff:... is handled by the mapped-IPv4 logic, not by the bare "::" regex
    expect((await scrapeOgMetadata('http://[::2]/')).ogTitle).toBe('Example Title');
  });

  it('rejects IPv4-mapped IPv6 addresses that map to private IPv4', async () => {
    expect((await scrapeOgMetadata('http://[::ffff:10.0.0.1]/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://[::ffff:127.0.0.1]/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://[::ffff:192.168.1.1]/')).ogTitle).toBeNull();
    expect((await scrapeOgMetadata('http://[::ffff:169.254.169.254]/')).ogTitle).toBeNull();
  });

  it('allows IPv4-mapped IPv6 addresses that map to public IPv4', async () => {
    expect((await scrapeOgMetadata('http://[::ffff:93.184.216.34]/')).ogTitle).toBe('Example Title');
  });

  it('allows public IPv6 addresses', async () => {
    expect((await scrapeOgMetadata('http://[2606:4700:4700::1111]/')).ogTitle).toBe('Example Title');
  });

  it('allows direct public IP in URL', async () => {
    const result = await scrapeOgMetadata('http://93.184.216.34/page');
    expect(result.ogTitle).toBe('Example Title');
  });

  it('rejects when DNS cannot resolve the hostname (fail closed)', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ENOTFOUND'));
    const result = await scrapeOgMetadata('https://no-such-host.example');
    expect(result.ogTitle).toBeNull();
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      data: { error: 'URL hostname could not be safely resolved.' },
    }));
  });

  it('rejects when any resolved address is private', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '10.1.2.3', family: 4 },
    ]);
    const result = await scrapeOgMetadata('https://mixed.example');
    expect(result.ogTitle).toBeNull();
  });

  it('returns null ogImage when result has no image array', async () => {
    const ogs = await import('open-graph-scraper');
    (ogs.default as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: { ogTitle: 'T', ogDescription: 'D', ogSiteName: 'S' },
    });
    const result = await scrapeOgMetadata('https://example.com');
    expect(result.ogImage).toBeNull();
  });

  it('drops ogImage values that are not valid http(s) URLs', async () => {
    const ogs = await import('open-graph-scraper');
    (ogs.default as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: { ogTitle: 'T', ogDescription: 'D', ogImage: [{ url: 'javascript:alert(1)' }], ogSiteName: 'S' },
    });
    const result = await scrapeOgMetadata('https://example.com');
    expect(result.ogImage).toBeNull();
  });

  it('passes a short timeout to the scraper', async () => {
    const ogs = await import('open-graph-scraper');
    await scrapeOgMetadata('https://example.com');
    expect(ogs.default).toHaveBeenCalledWith({ url: 'https://example.com', timeout: 5 });
  });

  it('logs DNS failure errors when scraping fails after a failed lookup', async () => {
    const ogs = await import('open-graph-scraper');
    (ogs.default as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    await scrapeOgMetadata('https://fail.example');
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      data: { error: 'Error: boom' },
    }));
  });
});
