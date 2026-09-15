import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EventEmitter } from 'node:events';
import { scrapeOgMetadata } from '@/lib/og-scraper';

vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}));

vi.mock('node:https', () => ({
  default: {
    request: vi.fn(),
  },
}));

vi.mock('node:http', () => ({
  default: {
    request: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}));

const html = `
  <html>
    <head>
      <meta property="og:title" content="Example Title">
      <meta property="og:description" content="Example Description">
      <meta property="og:image" content="https://example.com/img.png">
      <meta property="og:site_name" content="Example">
    </head>
  </html>
`;

function response(status: number, body = '', headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

async function mockHttpsResponses(...responses: Response[]) {
  const https = await import('node:https');
  const request = https.default.request as unknown as Mock;
  let index = 0;
  request.mockImplementation((options: unknown, callback: (res: EventEmitter & {
    statusCode: number;
    headers: Record<string, string>;
  }) => void) => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const req = new EventEmitter() as EventEmitter & {
      setTimeout: Mock;
      destroy: Mock;
      end: Mock;
    };
    req.setTimeout = vi.fn();
    req.destroy = vi.fn((error?: Error) => {
      if (error) queueMicrotask(() => req.emit('error', error));
      return req;
    });
    req.end = vi.fn(async () => {
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = response.status;
      res.headers = Object.fromEntries(response.headers.entries());
      callback(res);
      const body = await response.text();
      if (body) res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return req;
  });
  return request;
}

describe('scrapeOgMetadata', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await mockHttpsResponses(response(200, html, { 'content-type': 'text/html' }));
  });

  it('returns metadata for a valid URL', async () => {
    const result = await scrapeOgMetadata('https://example.com');
    expect(result).toEqual({
      url: 'https://example.com',
      ogTitle: 'Example Title',
      ogDescription: 'Example Description',
      ogImage: 'https://example.com/img.png',
      ogSiteName: 'Example',
    });
  });

  it('returns null metadata for invalid URL', async () => {
    const result = await scrapeOgMetadata('not-a-url');
    expect(result.ogTitle).toBeNull();
    const https = await import('node:https');
    expect(https.default.request).not.toHaveBeenCalled();
  });

  it('follows redirects through the SSRF-safe path', async () => {
    const request = await mockHttpsResponses(
      response(301, '', { location: '/next' }),
      response(200, html, { 'content-type': 'text/html' }),
    );

    const result = await scrapeOgMetadata('https://example.com/start');

    expect(result.ogTitle).toBe('Example Title');
    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        hostname: '93.184.216.34',
        path: '/start',
        headers: expect.objectContaining({ Host: 'example.com' }),
      }),
      expect.any(Function),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        hostname: '93.184.216.34',
        path: '/next',
        headers: expect.objectContaining({ Host: 'example.com' }),
      }),
      expect.any(Function),
    );
  });

  it('blocks private redirect hops and logs the SSRF block', async () => {
    const request = await mockHttpsResponses(response(302, '', { location: 'http://127.0.0.1/admin' }));

    const result = await scrapeOgMetadata('https://example.com/start');

    expect(result.ogTitle).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      message: 'SSRF blocked: https://example.com/start',
      service: 'og-scraper',
      data: { error: 'URL resolves to a private/internal IP range.' },
    }));
  });

  it('fails closed when DNS cannot resolve', async () => {
    const dns = await import('dns/promises');
    (dns.default.lookup as unknown as Mock).mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await scrapeOgMetadata('https://missing.example');

    expect(result.ogTitle).toBeNull();
    const https = await import('node:https');
    expect(https.default.request).not.toHaveBeenCalled();
    const { log } = await import('@/lib/logger');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      data: { error: 'URL hostname could not be safely resolved.' },
    }));
  });
});
