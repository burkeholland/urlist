import { describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/cosmos';
import {
  getGlobalAnalytics,
  getListAnalytics,
  getListAnalyticsSummary,
  hashVisitorId,
  recordLinkClick,
  recordPageView,
} from '@/lib/analytics';

vi.mock('@/lib/cosmos', () => ({ getDb: vi.fn() }));

type Doc = Record<string, any>;

function createMockDb(seed: Record<string, Doc[]> = {}) {
  const data = new Map<string, Map<string, Doc>>();
  for (const [container, docs] of Object.entries(seed)) {
    data.set(container, new Map(docs.map((doc) => [doc.id, { ...doc }])));
  }
  const store = (name: string) => {
    if (!data.has(name)) data.set(name, new Map());
    return data.get(name)!;
  };
  const db = {
    data,
    container: vi.fn((name: string) => ({
      items: {
        create: vi.fn(async (doc: Doc) => {
          store(name).set(doc.id, { ...doc });
          return { resource: doc };
        }),
        query: vi.fn((query: { query: string; parameters: { name: string; value: any }[] }) => ({
          fetchAll: vi.fn(async () => {
            const params = new Map(query.parameters.map((p) => [p.name, p.value]));
            let resources = [...store(name).values()];
            // SELECT VALUE COUNT(1) with type filter
            if (query.query.includes('COUNT(1)')) {
              if (params.has('@slug')) resources = resources.filter((d) => d.slug === params.get('@slug'));
              const typeMatch = query.query.match(/c\.type = '(\w+)'/);
              if (typeMatch) resources = resources.filter((d) => d.type === typeMatch[1]);
              return { resources: [resources.length] };
            }
            if (params.has('@slug')) resources = resources.filter((d) => d.slug === params.get('@slug'));
            if (params.has('@listId')) resources = resources.filter((d) => d.listId === params.get('@listId'));
            if (params.has('@from')) resources = resources.filter((d) => d.timestamp >= params.get('@from'));
            if (params.has('@to')) resources = resources.filter((d) => d.timestamp <= params.get('@to'));
            const slugParams = query.parameters.filter((p) => /^@slug\d+$/.test(p.name)).map((p) => p.value);
            if (slugParams.length) resources = resources.filter((d) => slugParams.includes(d.slug));
            else if (query.query.includes('c.slug IN')) {
              // Events querying across a slug list that resolves to no slugs match nothing
              resources = [];
            }
            const idParams = query.parameters.filter((p) => /^@id\d+$/.test(p.name)).map((p) => p.value);
            if (idParams.length) resources = resources.filter((d) => idParams.includes(d.id));
            // Emulate projection: SELECT c.id, c.url, c.ogTitle ...
            if (query.query.startsWith('SELECT c.')) {
              const fields = [...query.query.matchAll(/c\.(\w+)/g)].map((m) => m[1]);
              resources = resources.map((d) => {
                const projected: Doc = {};
                for (const f of fields) if (f in d) projected[f] = d[f];
                return projected;
              });
            }
            return { resources: resources.map((d) => ({ ...d })) };
          }),
        })),
      },
    })),
  };
  return db;
}

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-07-20T12:00:00Z').getTime();

const pv = (id: string, slug: string, visitorId: string, timestamp: number, extra: Doc = {}): Doc => ({
  id, slug, type: 'pageView', visitorId, referrer: null, utmSource: null, utmMedium: null,
  utmCampaign: null, country: null, timestamp, ...extra,
});
const lc = (id: string, slug: string, linkId: string, visitorId: string, timestamp: number, extra: Doc = {}): Doc => ({
  id, slug, type: 'linkClick', linkId, visitorId, referrer: null, timestamp, ...extra,
});

describe('hashVisitorId', () => {
  it('returns a 32-character hex string', async () => {
    const hash = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces the same hash for same inputs', async () => {
    const a = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    const b = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    expect(a).toBe(b);
  });

  it('produces different hashes for different IPs', async () => {
    const a = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    const b = await hashVisitorId('5.6.7.8', 'Mozilla/5.0');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different user agents', async () => {
    const a = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    const b = await hashVisitorId('1.2.3.4', 'Chrome/100');
    expect(a).not.toBe(b);
  });

  it('matches the known SHA-256 fingerprint for a fixed input', async () => {
    // SHA-256 of "1.2.3.4:Mozilla/5.0", first 16 bytes hex-encoded
    const hash = await hashVisitorId('1.2.3.4', 'Mozilla/5.0');
    const expected = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('1.2.3.4:Mozilla/5.0'))),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
    expect(hash).toBe(expected);
    expect(hash).not.toBe('');
  });
});

describe('recordPageView', () => {
  it('creates a pageView analytics document with all fields', async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordPageView({
      slug: 'my-list', visitorId: 'v1', referrer: 'https://twitter.com/x',
      utmSource: 's', utmMedium: 'm', utmCampaign: 'c', country: 'US',
    });
    const docs = [...db.data.get('analytics')!.values()];
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toMatch(/^pv_[A-Za-z0-9_-]{12}$/);
    expect(docs[0].type).toBe('pageView');
    expect(docs[0].slug).toBe('my-list');
    expect(docs[0].visitorId).toBe('v1');
    expect(docs[0].referrer).toBe('https://twitter.com/x');
    expect(docs[0].utmSource).toBe('s');
    expect(docs[0].utmMedium).toBe('m');
    expect(docs[0].utmCampaign).toBe('c');
    expect(docs[0].country).toBe('US');
    expect(typeof docs[0].timestamp).toBe('number');
  });
});

describe('recordLinkClick', () => {
  it('creates a linkClick analytics document', async () => {
    const db = createMockDb();
    vi.mocked(getDb).mockReturnValue(db as any);
    await recordLinkClick({ slug: 'my-list', linkId: 'link-1', visitorId: 'v1', referrer: null });
    const docs = [...db.data.get('analytics')!.values()];
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toMatch(/^lc_[A-Za-z0-9_-]{12}$/);
    expect(docs[0].type).toBe('linkClick');
    expect(docs[0].linkId).toBe('link-1');
    expect(docs[0].referrer).toBeNull();
  });
});

describe('getListAnalytics', () => {
  it('aggregates views, visitors, clicks, referrers, geo, and per-link stats', async () => {
    const db = createMockDb({
      analytics: [
        pv('e1', 'my-list', 'v1', t0, { referrer: 'https://www.twitter.com/post', country: 'US' }),
        pv('e2', 'my-list', 'v2', t0 + DAY, { referrer: 'https://linkedin.com/in/x', country: 'DE' }),
        pv('e3', 'my-list', 'v1', t0 + DAY, {}),
        lc('e4', 'my-list', 'link-1', 'v1', t0 + DAY),
        lc('e5', 'my-list', 'link-1', 'v2', t0 + DAY),
        lc('e6', 'my-list', 'link-2', 'v1', t0 + DAY),
        lc('e7', 'my-list', null as any, 'v1', t0 + DAY),
        pv('e8', 'other-list', 'v9', t0),
      ],
      links: [
        { id: 'link-1', listId: 'list-1', url: 'https://a.com', ogTitle: 'A' },
        { id: 'link-2', listId: 'list-1', url: 'https://b.com', ogTitle: null },
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const result = await getListAnalytics('my-list', 'list-1');

    expect(result.listId).toBe('list-1');
    expect(result.totalViews).toBe(3);
    expect(result.uniqueVisitors).toBe(2);
    expect(result.totalClicks).toBe(4);
    expect(result.clickThroughRate).toBeCloseTo(4 / 3);

    // Daily buckets sorted by date
    expect(result.viewsOverTime).toEqual([
      { date: '2026-07-20', views: 1, uniqueVisitors: 1 },
      { date: '2026-07-21', views: 2, uniqueVisitors: 2 },
    ]);

    // Referrer categories: twitter → Twitter / X, linkedin → LinkedIn, null → Direct
    expect(result.topReferrers).toEqual([
      { referrer: 'Twitter / X', count: 1 },
      { referrer: 'LinkedIn', count: 1 },
      { referrer: 'Direct', count: 1 },
    ]);

    expect(result.geoBreakdown).toEqual([
      { country: 'US', count: 1 },
      { country: 'DE', count: 1 },
      { country: 'Unknown', count: 1 },
    ]);

    // e7's null linkId is excluded from per-link stats
    expect(result.linkClicks).toEqual([
      { linkId: 'link-1', url: 'https://a.com', title: 'A', clicks: 2 },
      { linkId: 'link-2', url: 'https://b.com', title: null, clicks: 1 },
    ]);
  });

  it('sorts daily buckets chronologically even when events arrive out of order', async () => {
    const db = createMockDb({
      analytics: [
        pv('e1', 's', 'v1', t0 + 2 * DAY),
        pv('e2', 's', 'v1', t0),
        pv('e3', 's', 'v1', t0 + DAY),
      ],
      links: [],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalytics('s', 'l1');
    expect(result.viewsOverTime.map((d) => d.date)).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
  });

  it('sorts referrers, geo, and link clicks by descending count', async () => {
    const db = createMockDb({
      analytics: [
        pv('e1', 's', 'v1', t0, { referrer: 'https://a.example.com', country: 'US' }),
        pv('e2', 's', 'v2', t0, { referrer: 'https://b.example.com', country: 'DE' }),
        pv('e3', 's', 'v3', t0, { referrer: 'https://b.example.com', country: 'DE' }),
        pv('e4', 's', 'v4', t0, { referrer: 'https://b.example.com', country: 'DE' }),
        pv('e5', 's', 'v5', t0, { referrer: 'https://a.example.com', country: 'US' }),
        lc('e6', 's', 'link-1', 'v1', t0),
        lc('e7', 's', 'link-2', 'v1', t0),
        lc('e8', 's', 'link-2', 'v2', t0),
      ],
      links: [
        { id: 'link-1', listId: 'l1', url: 'https://a.com', ogTitle: 'A' },
        { id: 'link-2', listId: 'l1', url: 'https://b.com', ogTitle: 'B' },
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalytics('s', 'l1');
    expect(result.topReferrers.map((r) => [r.referrer, r.count])).toEqual([
      ['b.example.com', 3],
      ['a.example.com', 2],
    ]);
    expect(result.geoBreakdown.map((g) => [g.country, g.count])).toEqual([
      ['DE', 3],
      ['US', 2],
    ]);
    expect(result.linkClicks.map((l) => [l.linkId, l.clicks])).toEqual([
      ['link-2', 2],
      ['link-1', 1],
    ]);
  });

  it('applies from/to date range filters', async () => {
    const db = createMockDb({
      analytics: [pv('e1', 's', 'v1', t0), pv('e2', 's', 'v2', t0 + 10 * DAY)],
      links: [],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalytics('s', 'l1', t0 + 5 * DAY, t0 + 15 * DAY);
    expect(result.totalViews).toBe(1);
    expect(result.clickThroughRate).toBe(0);
    expect(result.linkClicks).toEqual([]);
    expect(result.viewsOverTime).toEqual([
      { date: '2026-07-30', views: 1, uniqueVisitors: 1 },
    ]);
  });

  it('issues the expected analytics and link queries', async () => {
    const db = createMockDb({ analytics: [], links: [] });
    vi.mocked(getDb).mockReturnValue(db as any);
    await getListAnalytics('my-slug', 'list-9', 100, 200);
    const queries = db.container.mock.results
      .map((r: any) => r.value.items.query.mock.calls)
      .flat()
      .map((c: any) => c?.[0]);
    expect(queries[0].query).toBe('SELECT * FROM c WHERE c.slug = @slug AND c.timestamp >= @from AND c.timestamp <= @to');
    expect(queries[0].parameters).toEqual([
      { name: '@slug', value: 'my-slug' },
      { name: '@from', value: 100 },
      { name: '@to', value: 200 },
    ]);
    expect(queries[1].query).toBe('SELECT c.id, c.url, c.ogTitle FROM c WHERE c.listId = @listId');
    expect(queries[1].parameters).toEqual([{ name: '@listId', value: 'list-9' }]);
  });

  it('returns zero CTR and empty aggregations when there are no events', async () => {
    const db = createMockDb({ analytics: [], links: [] });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalytics('s', 'l1');
    expect(result.totalViews).toBe(0);
    expect(result.uniqueVisitors).toBe(0);
    expect(result.totalClicks).toBe(0);
    expect(result.clickThroughRate).toBe(0);
    expect(result.viewsOverTime).toEqual([]);
    expect(result.topReferrers).toEqual([]);
    expect(result.geoBreakdown).toEqual([]);
    expect(result.linkClicks).toEqual([]);
  });

  it('uses empty url and null title for clicks on unknown links', async () => {
    const db = createMockDb({
      analytics: [lc('e1', 's', 'ghost-link', 'v1', t0)],
      links: [],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalytics('s', 'l1');
    expect(result.linkClicks).toEqual([{ linkId: 'ghost-link', url: '', title: null, clicks: 1 }]);
  });
});

describe('getListAnalyticsSummary', () => {
  it('returns counts for pageViews and linkClicks', async () => {
    const db = createMockDb({
      analytics: [
        pv('e1', 's', 'v1', t0),
        pv('e2', 's', 'v2', t0),
        lc('e3', 's', 'link-1', 'v1', t0),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalyticsSummary('s');
    expect(result).toEqual({ totalViews: 2, totalClicks: 1 });
    const queries = db.container.mock.results
      .map((r: any) => r.value.items.query.mock.calls)
      .flat()
      .map((c: any) => c?.[0]);
    expect(queries[0].query).toBe("SELECT VALUE COUNT(1) FROM c WHERE c.slug = @slug AND c.type = 'pageView'");
    expect(queries[1].query).toBe("SELECT VALUE COUNT(1) FROM c WHERE c.slug = @slug AND c.type = 'linkClick'");
    expect(queries[0].parameters).toEqual([{ name: '@slug', value: 's' }]);
  });

  it('returns zeros when no events exist', async () => {
    const db = createMockDb({ analytics: [] });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalyticsSummary('s');
    expect(result).toEqual({ totalViews: 0, totalClicks: 0 });
  });

  it('returns the raw COUNT values from Cosmos', async () => {
    // COUNT(1) always returns exactly one row — the value flows straight through
    const db = createMockDb({
      analytics: [pv('e1', 's', 'v1', t0)],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalyticsSummary('s');
    expect(result.totalViews).toBe(1);
    expect(result.totalClicks).toBe(0);
  });
});

describe('getGlobalAnalytics', () => {
  it('returns zeroed analytics when user has no lists', async () => {
    const result = await getGlobalAnalytics([]);
    expect(result).toEqual({
      totalViews: 0, totalClicks: 0, totalUniqueVisitors: 0, viewsOverTime: [], topLists: [],
    });
  });

  it('aggregates across lists with per-list breakdown sorted by views', async () => {
    const db = createMockDb({
      lists: [
        { id: 'l1', slug: 'alpha', description: 'First' },
        { id: 'l2', slug: 'beta', description: 'Second' },
      ],
      analytics: [
        pv('e1', 'alpha', 'v1', t0),
        pv('e2', 'alpha', 'v2', t0 + DAY),
        pv('e3', 'beta', 'v1', t0 + DAY),
        lc('e4', 'beta', 'link-1', 'v1', t0 + DAY),
        lc('e5', 'alpha', 'link-2', 'v2', t0 + DAY),
      ],
    });
    vi.mocked(getDb).mockReturnValue(db as any);

    const result = await getGlobalAnalytics(['l1', 'l2']);

    expect(result.totalViews).toBe(3);
    expect(result.totalClicks).toBe(2);
    expect(result.totalUniqueVisitors).toBe(2);
    expect(result.viewsOverTime).toEqual([
      { date: '2026-07-20', views: 1, uniqueVisitors: 1 },
      { date: '2026-07-21', views: 2, uniqueVisitors: 2 },
    ]);
    expect(result.topLists).toEqual([
      { listId: 'l1', slug: 'alpha', description: 'First', totalViews: 2, totalClicks: 1, uniqueVisitors: 2 },
      { listId: 'l2', slug: 'beta', description: 'Second', totalViews: 1, totalClicks: 1, uniqueVisitors: 1 },
    ]);
  });

  it('applies date range filters', async () => {
    const db = createMockDb({
      lists: [{ id: 'l1', slug: 'alpha', description: 'First' }],
      analytics: [pv('e1', 'alpha', 'v1', t0), pv('e2', 'alpha', 'v2', t0 + 10 * DAY)],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getGlobalAnalytics(['l1'], t0 + 5 * DAY, t0 + 15 * DAY);
    expect(result.totalViews).toBe(1);
  });

  it('issues the expected list and event queries', async () => {
    const db = createMockDb({
      lists: [{ id: 'l1', slug: 'alpha', description: 'First' }],
      analytics: [],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    await getGlobalAnalytics(['l1', 'l2'], 111, 222);
    const queries = db.container.mock.results
      .map((r: any) => r.value.items.query.mock.calls)
      .flat()
      .map((c: any) => c?.[0]);
    expect(queries[0].query).toBe('SELECT c.id, c.slug, c.description FROM c WHERE c.id IN (@id0,@id1)');
    expect(queries[0].parameters).toEqual([
      { name: '@id0', value: 'l1' },
      { name: '@id1', value: 'l2' },
    ]);
    expect(queries[1].query).toBe('SELECT * FROM c WHERE c.slug IN (@slug0) AND c.timestamp >= @from AND c.timestamp <= @to');
    expect(queries[1].parameters).toEqual([
      { name: '@slug0', value: 'alpha' },
      { name: '@from', value: 111 },
      { name: '@to', value: 222 },
    ]);
  });

  it('falls back to slug and empty description for clicks without list metadata', async () => {
    const db = createMockDb({
      lists: [{ id: 'l1', slug: 'alpha', description: 'First' }],
      analytics: [lc('e2', 'alpha', 'link-1', 'v1', t0)],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getGlobalAnalytics(['l1']);
    expect(result.topLists).toEqual([
      { listId: 'l1', slug: 'alpha', description: 'First', totalViews: 0, totalClicks: 1, uniqueVisitors: 0 },
    ]);
  });

  it('falls back to slug and empty description when list metadata is missing', async () => {
    // Hand-built mock: the analytics query returns an event for a slug whose
    // list metadata was not returned by the lists query.
    const db = {
      container: vi.fn((name: string) => ({
        items: {
          query: vi.fn(() => ({
            fetchAll: vi.fn(async () => ({
              resources:
                name === 'lists'
                  ? [{ id: 'l1', slug: 'alpha', description: 'First' }]
                  : [lc('e1', 'ghost', 'link-1', 'v1', t0)],
            })),
          })),
        },
      })),
    };
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getGlobalAnalytics(['l1']);
    expect(result.topLists).toEqual([
      { listId: 'ghost', slug: 'ghost', description: '', totalViews: 0, totalClicks: 1, uniqueVisitors: 0 },
    ]);
  });
});

describe('categorizeReferrer (via getListAnalytics topReferrers)', () => {
  async function referrerFor(referrer: string | null): Promise<string> {
    const db = createMockDb({
      analytics: [pv('e1', 's', 'v1', t0, { referrer })],
      links: [],
    });
    vi.mocked(getDb).mockReturnValue(db as any);
    const result = await getListAnalytics('s', 'l1');
    return result.topReferrers[0].referrer;
  }

  it.each([
    ['https://twitter.com/u', 'Twitter / X'],
    ['https://x.com/u', 'Twitter / X'],
    ['https://t.co/abc', 'Twitter / X'],
    ['https://www.facebook.com/page', 'Facebook'],
    ['https://fb.com/page', 'Facebook'],
    ['https://linkedin.com/in/u', 'LinkedIn'],
    ['https://www.reddit.com/r/x', 'Reddit'],
    ['https://www.google.com/search', 'Google'],
    ['https://google.co.uk/search', 'Google'],
    ['https://bing.com/search', 'Bing'],
    ['https://github.com/repo', 'GitHub'],
    ['https://instagram.com/p/x', 'Instagram'],
    ['https://news.ycombinator.com/item', 'news.ycombinator.com'],
    ['not-a-url', 'Direct'],
    [null, 'Direct'],
  ])('categorizes %s as %s', async (input, expected) => {
    expect(await referrerFor(input)).toBe(expected);
  });
});
