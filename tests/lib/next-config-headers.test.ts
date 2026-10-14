import { describe, expect, it } from 'vitest';
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import nextConfig from '@/next.config';

type HeaderRule = {
  source: string;
  has?: { type: string; key: string; value?: string }[];
  missing?: { type: string; key: string; value?: string }[];
  headers: { key: string; value: string }[];
};

// Mirrors how Next.js picks header rules: source regex, then has/missing query checks,
// with later rules overriding earlier ones for the same header key.
async function headersFor(path: string, query: Record<string, string> = {}) {
  const rules = (await nextConfig.headers!()) as HeaderRule[];
  const result: Record<string, string> = {};

  for (const rule of rules) {
    if (!pathToRegexp(rule.source).test(path)) continue;
    const queryMatches = (item: { key: string; value?: string }) =>
      item.value === undefined ? item.key in query : query[item.key] === item.value;
    if (rule.has && !rule.has.every(queryMatches)) continue;
    if (rule.missing && rule.missing.some(queryMatches)) continue;

    for (const header of rule.headers) {
      result[header.key] = header.value;
    }
  }

  return result;
}

describe('embed frame policy', () => {
  it.each(['/my-list', '/nested/list', '/apiary', '/application'])(
    'lets public list %s be framed only when requested as an embed',
    async (path) => {
      const embed = await headersFor(path, { embed: '1' });
      expect(embed['Content-Security-Policy']).toContain('frame-ancestors *');
      expect(embed['X-Frame-Options']).toBeUndefined();
      expect(embed['Permissions-Policy']).toContain('clipboard-write=()');
      expect(embed['Referrer-Policy']).toBe('strict-origin-when-cross-origin');

      const direct = await headersFor(path);
      expect(direct['Content-Security-Policy']).toBe("frame-ancestors 'self'");
      expect(direct['X-Frame-Options']).toBe('SAMEORIGIN');
    },
  );

  it.each(['/', '/app', '/app/compose/abc', '/api/lists', '/api/auth/me'])(
    'never lets %s be framed by other sites, even with ?embed=1',
    async (path) => {
      const headers = await headersFor(path, { embed: '1' });
      expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'self'");
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    },
  );

  it('does not treat other embed values as embeds', async () => {
    const headers = await headersFor('/my-list', { embed: '0' });
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'self'");
  });

  it('restricts what an embed can load or do', async () => {
    const csp = (await headersFor('/my-list', { embed: '1' }))['Content-Security-Policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
