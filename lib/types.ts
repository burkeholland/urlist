// Shared types for The Urlist

export interface ListRecord {
  slug: string;
  description: string;
  ownerId: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface LinkRecord {
  url: string;
  position: number;
  pinned: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  createdAt: number;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface LinkWithId extends LinkRecord {
  id: string;
}

export interface ListWithLinks {
  listId: string;
  slug: string;
  description: string;
  ownerId: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  userRole?: MembershipRole | null;
  links: LinkWithId[];
}

export type MembershipRole = 'owner' | 'editor' | 'viewer';
export type InviteRole = Exclude<MembershipRole, 'owner'>;

export interface ListMembership {
  id: string;
  uid: string;
  listId: string;
  role: MembershipRole;
  createdAt: number;
  updatedAt: number;
  invitedBy?: string | null;
  acceptedAt?: number | null;
  username?: string | null;
  name?: string | null;
  avatar?: string | null;
}

export interface ListInvite {
  id: string;
  type: 'invite';
  listId: string;
  role: InviteRole;
  tokenHash: string;
  createdAt: number;
  createdBy: string;
  expiresAt: number;
  revokedAt?: number | null;
  revokedBy?: string | null;
  acceptedAt?: number | null;
  acceptedBy?: string | null;
  rotatedFrom?: string | null;
}

export type SafeListInvite = Omit<ListInvite, 'tokenHash'>;

export interface DraftLink {
  id: string;
  url: string;
  position: number;
  pinned: boolean;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
  ogLoading?: boolean;
}

export interface Draft {
  slug: string;
  description: string;
  links: DraftLink[];
  savedAt: number;
}

export interface OgMetadata {
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  ogSiteName: string | null;
}

export type SlugValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'taken';

// ── Analytics types ──

export type AnalyticsEventType = 'pageView' | 'linkClick';

export interface AnalyticsEvent {
  id: string;
  slug: string;
  type: AnalyticsEventType;
  visitorId: string;
  referrer: string | null;
  timestamp: number;
  // pageView fields
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  country?: string | null;
  // linkClick fields
  linkId?: string;
}

export interface DailyViews {
  date: string; // YYYY-MM-DD
  views: number;
  uniqueVisitors: number;
}

export interface ReferrerStats {
  referrer: string;
  count: number;
}

export interface GeoStats {
  country: string;
  count: number;
}

export interface LinkClickStats {
  linkId: string;
  url: string;
  title: string | null;
  clicks: number;
}

export interface ListAnalytics {
  listId: string;
  totalViews: number;
  uniqueVisitors: number;
  totalClicks: number;
  clickThroughRate: number;
  viewsOverTime: DailyViews[];
  topReferrers: ReferrerStats[];
  geoBreakdown: GeoStats[];
  linkClicks: LinkClickStats[];
}

export interface ListAnalyticsSummary {
  totalViews: number;
  totalClicks: number;
}

export interface ListPerformance {
  listId: string;
  slug: string;
  description: string;
  totalViews: number;
  totalClicks: number;
  uniqueVisitors: number;
}

export interface GlobalAnalytics {
  totalViews: number;
  totalClicks: number;
  totalUniqueVisitors: number;
  viewsOverTime: DailyViews[];
  topLists: ListPerformance[];
}

export interface TrackPageViewPayload {
  type: 'pageView';
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface TrackLinkClickPayload {
  type: 'linkClick';
  linkId: string;
  referrer?: string;
}

export type TrackEventPayload = TrackPageViewPayload | TrackLinkClickPayload;
