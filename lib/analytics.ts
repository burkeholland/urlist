import { getDb } from './cosmos';
import { nanoid } from 'nanoid';
import type {
  AnalyticsEvent,
  ListAnalytics,
  ListAnalyticsSummary,
  ListPerformance,
  GlobalAnalytics,
  DailyViews,
  ReferrerStats,
  GeoStats,
  LinkClickStats,
} from './types';

// ── Record events ──

export async function recordPageView(params: {
  slug: string;
  visitorId: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  country: string | null;
}): Promise<void> {
  const db = getDb();
  await db.container('analytics').items.create({
    id: `pv_${nanoid(12)}`,
    slug: params.slug,
    type: 'pageView',
    visitorId: params.visitorId,
    referrer: params.referrer,
    utmSource: params.utmSource,
    utmMedium: params.utmMedium,
    utmCampaign: params.utmCampaign,
    country: params.country,
    timestamp: Date.now(),
  });
}

export async function recordLinkClick(params: {
  slug: string;
  linkId: string;
  visitorId: string;
  referrer: string | null;
}): Promise<void> {
  const db = getDb();
  await db.container('analytics').items.create({
    id: `lc_${nanoid(12)}`,
    slug: params.slug,
    type: 'linkClick',
    linkId: params.linkId,
    visitorId: params.visitorId,
    referrer: params.referrer,
    timestamp: Date.now(),
  });
}

// ── Visitor fingerprinting ──

export async function hashVisitorId(ip: string, userAgent: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${ip}:${userAgent}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ── Aggregation queries ──

export async function getListAnalytics(
  slug: string,
  listId: string,
  from?: number,
  to?: number,
): Promise<ListAnalytics> {
  const db = getDb();
  const fromTs = from ?? 0;
  const toTs = to ?? Date.now();

  // Fetch all analytics events for this slug in the date range
  const { resources: events } = await db
    .container('analytics')
    .items.query<AnalyticsEvent>({
      query:
        'SELECT * FROM c WHERE c.slug = @slug AND c.timestamp >= @from AND c.timestamp <= @to',
      parameters: [
        { name: '@slug', value: slug },
        { name: '@from', value: fromTs },
        { name: '@to', value: toTs },
      ],
    })
    .fetchAll();

  const pageViews = events.filter((e) => e.type === 'pageView');
  const linkClicks = events.filter((e) => e.type === 'linkClick');

  // Fetch link metadata for titles/urls
  const { resources: links } = await db
    .container('links')
    .items.query<{ id: string; url: string; ogTitle: string | null }>({
      query: 'SELECT c.id, c.url, c.ogTitle FROM c WHERE c.listId = @listId',
      parameters: [{ name: '@listId', value: listId }],
    })
    .fetchAll();

  const linkMeta = new Map(links.map((l) => [l.id, l]));

  // Total views & unique visitors
  const totalViews = pageViews.length;
  const uniqueVisitorIds = new Set(pageViews.map((pv) => pv.visitorId));
  const uniqueVisitors = uniqueVisitorIds.size;
  const totalClicks = linkClicks.length;
  const clickThroughRate = totalViews > 0 ? totalClicks / totalViews : 0;

  // Views over time (daily buckets)
  const dailyMap = new Map<string, { views: number; visitors: Set<string> }>();
  for (const pv of pageViews) {
    const date = new Date(pv.timestamp).toISOString().slice(0, 10);
    const entry = dailyMap.get(date) ?? { views: 0, visitors: new Set<string>() };
    entry.views++;
    entry.visitors.add(pv.visitorId);
    dailyMap.set(date, entry);
  }
  const viewsOverTime: DailyViews[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, views: data.views, uniqueVisitors: data.visitors.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top referrers
  const referrerMap = new Map<string, number>();
  for (const pv of pageViews) {
    const ref = categorizeReferrer(pv.referrer ?? null);
    referrerMap.set(ref, (referrerMap.get(ref) ?? 0) + 1);
  }
  const topReferrers: ReferrerStats[] = Array.from(referrerMap.entries())
    .map(([referrer, count]) => ({ referrer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Geo breakdown
  const geoMap = new Map<string, number>();
  for (const pv of pageViews) {
    const country = pv.country || 'Unknown';
    geoMap.set(country, (geoMap.get(country) ?? 0) + 1);
  }
  const geoBreakdown: GeoStats[] = Array.from(geoMap.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Per-link clicks
  const clickMap = new Map<string, number>();
  for (const lc of linkClicks) {
    if (lc.linkId) {
      clickMap.set(lc.linkId, (clickMap.get(lc.linkId) ?? 0) + 1);
    }
  }
  const linkClicksStats: LinkClickStats[] = Array.from(clickMap.entries())
    .map(([linkId, clicks]) => {
      const meta = linkMeta.get(linkId);
      return {
        linkId,
        url: meta?.url ?? '',
        title: meta?.ogTitle ?? null,
        clicks,
      };
    })
    .sort((a, b) => b.clicks - a.clicks);

  return {
    listId,
    totalViews,
    uniqueVisitors,
    totalClicks,
    clickThroughRate,
    viewsOverTime,
    topReferrers,
    geoBreakdown,
    linkClicks: linkClicksStats,
  };
}

export async function getListAnalyticsSummary(slug: string): Promise<ListAnalyticsSummary> {
  const db = getDb();

  const { resources: pageViewCounts } = await db
    .container('analytics')
    .items.query<number>({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.slug = @slug AND c.type = 'pageView'",
      parameters: [{ name: '@slug', value: slug }],
    })
    .fetchAll();

  const { resources: linkClickCounts } = await db
    .container('analytics')
    .items.query<number>({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.slug = @slug AND c.type = 'linkClick'",
      parameters: [{ name: '@slug', value: slug }],
    })
    .fetchAll();

  return {
    totalViews: pageViewCounts[0] ?? 0,
    totalClicks: linkClickCounts[0] ?? 0,
  };
}

// ── Global analytics across all user lists ──

export async function getGlobalAnalytics(
  listIds: string[],
  from?: number,
  to?: number,
): Promise<GlobalAnalytics> {
  if (listIds.length === 0) {
    return { totalViews: 0, totalClicks: 0, totalUniqueVisitors: 0, viewsOverTime: [], topLists: [] };
  }

  const db = getDb();
  const fromTs = from ?? 0;
  const toTs = to ?? Date.now();

  // Fetch all list metadata
  const { resources: lists } = await db.container('lists').items
    .query<{ id: string; slug: string; description: string }>({
      query: `SELECT c.id, c.slug, c.description FROM c WHERE c.id IN (${listIds.map((_, i) => `@id${i}`).join(',')})`,
      parameters: listIds.map((id, i) => ({ name: `@id${i}`, value: id })),
    })
    .fetchAll();

  // Fetch analytics events across all user's slugs
  const slugs = lists.map((l) => l.slug);
  const { resources: events } = await db.container('analytics').items
    .query<AnalyticsEvent>({
      query: `SELECT * FROM c WHERE c.slug IN (${slugs.map((_, i) => `@slug${i}`).join(',')}) AND c.timestamp >= @from AND c.timestamp <= @to`,
      parameters: [
        ...slugs.map((s, i) => ({ name: `@slug${i}`, value: s })),
        { name: '@from', value: fromTs },
        { name: '@to', value: toTs },
      ],
    })
    .fetchAll();

  const pageViews = events.filter((e) => e.type === 'pageView');
  const linkClicks = events.filter((e) => e.type === 'linkClick');

  // Totals
  const totalViews = pageViews.length;
  const totalClicks = linkClicks.length;
  const totalUniqueVisitors = new Set(pageViews.map((pv) => pv.visitorId)).size;

  // Views over time (daily buckets)
  const dailyMap = new Map<string, { views: number; visitors: Set<string> }>();
  for (const pv of pageViews) {
    const date = new Date(pv.timestamp).toISOString().slice(0, 10);
    const entry = dailyMap.get(date) ?? { views: 0, visitors: new Set<string>() };
    entry.views++;
    entry.visitors.add(pv.visitorId);
    dailyMap.set(date, entry);
  }
  const viewsOverTime: DailyViews[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, views: data.views, uniqueVisitors: data.visitors.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Per-list breakdown
  const slugToList = new Map(lists.map((l) => [l.slug, l]));
  const listStatsMap = new Map<string, { views: number; clicks: number; visitors: Set<string> }>();

  for (const pv of pageViews) {
    const stats = listStatsMap.get(pv.slug) ?? { views: 0, clicks: 0, visitors: new Set<string>() };
    stats.views++;
    stats.visitors.add(pv.visitorId);
    listStatsMap.set(pv.slug, stats);
  }
  for (const lc of linkClicks) {
    const stats = listStatsMap.get(lc.slug) ?? { views: 0, clicks: 0, visitors: new Set<string>() };
    stats.clicks++;
    listStatsMap.set(lc.slug, stats);
  }

  const topLists: ListPerformance[] = Array.from(listStatsMap.entries())
    .map(([slug, stats]) => {
      const list = slugToList.get(slug);
      return {
        listId: list?.id ?? slug,
        slug,
        description: list?.description ?? '',
        totalViews: stats.views,
        totalClicks: stats.clicks,
        uniqueVisitors: stats.visitors.size,
      };
    })
    .sort((a, b) => b.totalViews - a.totalViews);

  return { totalViews, totalClicks, totalUniqueVisitors, viewsOverTime, topLists };
}

// ── Helpers ──

function categorizeReferrer(referrer: string | null): string {
  if (!referrer) return 'Direct';
  try {
    const url = new URL(referrer);
    const host = url.hostname.replace(/^www\./, '');
    if (host.includes('twitter.com') || host.includes('x.com')) return 'Twitter / X';
    if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook';
    if (host.includes('linkedin.com')) return 'LinkedIn';
    if (host.includes('reddit.com')) return 'Reddit';
    if (host.includes('google.')) return 'Google';
    if (host.includes('bing.com')) return 'Bing';
    if (host.includes('github.com')) return 'GitHub';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('t.co')) return 'Twitter / X';
    return host;
  } catch {
    return 'Direct';
  }
}
