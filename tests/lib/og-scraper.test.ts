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

  it('handles OG scrape failure gracefully', async () => {
    const ogs = await import('open-graph-scraper');
    (ogs.default as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
    const result = await scrapeOgMetadata('https://slow-site.com');
    expect(result.ogTitle).toBeNull();
    expect(result.url).toBe('https://slow-site.com');
  });
});
