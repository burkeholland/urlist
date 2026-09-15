import type {
  DraftBranding,
  ListAccentPreset,
  ListAppearanceSettings,
  ListBranding,
  ListLayoutPreset,
  ListThemePreset,
} from '@/lib/types';

export const MAX_PUBLIC_TITLE_LENGTH = 80;
export const MAX_SOCIAL_TITLE_LENGTH = 120;
export const MAX_SOCIAL_DESCRIPTION_LENGTH = 200;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_IMAGE_WIDTH = 320;
export const MIN_IMAGE_HEIGHT = 180;
export const MAX_IMAGE_DIMENSION = 4096;

export const LIST_THEME_OPTIONS: Array<{ value: ListThemePreset; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'midnight', label: 'Midnight' },
];

export const LIST_ACCENT_OPTIONS: Array<{ value: ListAccentPreset; label: string }> = [
  { value: 'coral', label: 'Coral' },
  { value: 'teal', label: 'Teal' },
  { value: 'violet', label: 'Violet' },
  { value: 'amber', label: 'Amber' },
];

export const LIST_LAYOUT_OPTIONS: Array<{ value: ListLayoutPreset; label: string }> = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
  { value: 'cards', label: 'Cards' },
];

export const DEFAULT_LIST_APPEARANCE: ListAppearanceSettings = {
  theme: 'default',
  accent: 'coral',
  layout: 'comfortable',
};

export const DEFAULT_DRAFT_BRANDING: DraftBranding = {
  publicTitle: '',
  socialTitle: '',
  socialDescription: '',
  coverImageUrl: '',
  socialImageUrl: '',
  appearance: DEFAULT_LIST_APPEARANCE,
};

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export function normalizeAppearance(
  appearance?: Partial<ListAppearanceSettings> | null,
): ListAppearanceSettings {
  const theme = LIST_THEME_OPTIONS.some((option) => option.value === appearance?.theme)
    ? appearance!.theme!
    : DEFAULT_LIST_APPEARANCE.theme;
  const accent = LIST_ACCENT_OPTIONS.some((option) => option.value === appearance?.accent)
    ? appearance!.accent!
    : DEFAULT_LIST_APPEARANCE.accent;
  const layout = LIST_LAYOUT_OPTIONS.some((option) => option.value === appearance?.layout)
    ? appearance!.layout!
    : DEFAULT_LIST_APPEARANCE.layout;

  return { theme, accent, layout };
}

export function normalizeListBranding(
  branding?: Partial<ListBranding> | null,
): ListBranding {
  return {
    publicTitle: branding?.publicTitle ?? null,
    socialTitle: branding?.socialTitle ?? null,
    socialDescription: branding?.socialDescription ?? null,
    coverImage: branding?.coverImage ?? null,
    socialImage: branding?.socialImage ?? null,
    appearance: normalizeAppearance(branding?.appearance),
  };
}

export function normalizeDraftBranding(
  branding?: Partial<DraftBranding> | null,
): DraftBranding {
  return {
    publicTitle: branding?.publicTitle ?? '',
    socialTitle: branding?.socialTitle ?? '',
    socialDescription: branding?.socialDescription ?? '',
    coverImageUrl: branding?.coverImageUrl ?? '',
    socialImageUrl: branding?.socialImageUrl ?? '',
    appearance: normalizeAppearance(branding?.appearance),
  };
}

export function toDraftBranding(branding: ListBranding): DraftBranding {
  return {
    publicTitle: branding.publicTitle ?? '',
    socialTitle: branding.socialTitle ?? '',
    socialDescription: branding.socialDescription ?? '',
    coverImageUrl: branding.coverImage?.url ?? '',
    socialImageUrl: branding.socialImage?.url ?? '',
    appearance: normalizeAppearance(branding.appearance),
  };
}

export function getPublicListTitle(slug: string, branding?: Partial<ListBranding> | null): string {
  return branding?.publicTitle?.trim() || slug;
}

export function getSocialTitle(slug: string, branding?: Partial<ListBranding> | null): string {
  return branding?.socialTitle?.trim() || getPublicListTitle(slug, branding);
}

export function getPublicListDescription(
  description: string,
  linkCount: number,
  branding?: Partial<ListBranding> | null,
): string {
  return (
    branding?.socialDescription?.trim() ||
    description ||
    `A curated list of ${linkCount} link${linkCount === 1 ? '' : 's'}`
  );
}

export function getResolvedSocialImageUrl(
  slug: string,
  branding: ListBranding,
  origin: string,
): string {
  return (
    branding.socialImage?.url ||
    branding.coverImage?.url ||
    `${origin}/api/og-image/${slug}`
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean
      .split('')
      .map((part) => part + part)
      .join('')
    : clean;
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastTextColor(hex: string): '#111827' | '#ffffff' {
  const darkText = '#111827' as const;
  const lightText = '#ffffff' as const;
  const backgroundLuminance = getRelativeLuminance(hex);
  const darkContrast = (
    Math.max(backgroundLuminance, getRelativeLuminance(darkText)) + 0.05
  ) / (
    Math.min(backgroundLuminance, getRelativeLuminance(darkText)) + 0.05
  );
  const lightContrast = (
    Math.max(backgroundLuminance, getRelativeLuminance(lightText)) + 0.05
  ) / (
    Math.min(backgroundLuminance, getRelativeLuminance(lightText)) + 0.05
  );

  return darkContrast >= lightContrast ? darkText : lightText;
}

const THEME_TOKENS: Record<ListThemePreset, {
  pageGradient: string;
  heroGradient: string;
  heroBorder: string;
  heroText: string;
  heroMuted: string;
}> = {
  default: {
    pageGradient: 'var(--bg-gradient)',
    heroGradient: 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,255,255,0.82))',
    heroBorder: 'var(--surface-border)',
    heroText: 'var(--text)',
    heroMuted: 'var(--text-muted)',
  },
  sunset: {
    pageGradient: 'linear-gradient(180deg, #fff7ed 0%, #fff1f2 48%, #fff 100%)',
    heroGradient: 'linear-gradient(135deg, #fff7ed 0%, #ffe4e6 100%)',
    heroBorder: '#fed7aa',
    heroText: '#7c2d12',
    heroMuted: '#9a3412',
  },
  ocean: {
    pageGradient: 'linear-gradient(180deg, #eff6ff 0%, #ecfeff 52%, #fff 100%)',
    heroGradient: 'linear-gradient(135deg, #eff6ff 0%, #cffafe 100%)',
    heroBorder: '#bae6fd',
    heroText: '#0f172a',
    heroMuted: '#155e75',
  },
  midnight: {
    pageGradient: 'linear-gradient(180deg, #0f172a 0%, #111827 48%, #020617 100%)',
    heroGradient: 'linear-gradient(135deg, #172554 0%, #111827 100%)',
    heroBorder: '#312e81',
    heroText: '#f8fafc',
    heroMuted: '#cbd5e1',
  },
};

const ACCENT_TOKENS: Record<ListAccentPreset, {
  accent: string;
  accentSoft: string;
}> = {
  coral: {
    accent: '#ff7f50',
    accentSoft: 'rgba(255, 127, 80, 0.16)',
  },
  teal: {
    accent: '#0f766e',
    accentSoft: 'rgba(15, 118, 110, 0.16)',
  },
  violet: {
    accent: '#7c3aed',
    accentSoft: 'rgba(124, 58, 237, 0.16)',
  },
  amber: {
    accent: '#d97706',
    accentSoft: 'rgba(217, 119, 6, 0.18)',
  },
};

export function getBrandStyleVars(appearance: ListAppearanceSettings): Record<string, string> {
  const theme = THEME_TOKENS[appearance.theme];
  const accent = ACCENT_TOKENS[appearance.accent];

  return {
    '--list-page-gradient': theme.pageGradient,
    '--list-hero-gradient': theme.heroGradient,
    '--list-hero-border': theme.heroBorder,
    '--list-hero-text': theme.heroText,
    '--list-hero-muted': theme.heroMuted,
    '--list-accent': accent.accent,
    '--list-accent-soft': accent.accentSoft,
    '--list-accent-fg': getContrastTextColor(accent.accent),
  };
}
