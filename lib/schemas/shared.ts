import { z } from 'zod';
import {
  DEFAULT_LIST_APPEARANCE,
  LIST_ACCENT_OPTIONS,
  LIST_LAYOUT_OPTIONS,
  LIST_THEME_OPTIONS,
  MAX_PUBLIC_TITLE_LENGTH,
  MAX_SOCIAL_DESCRIPTION_LENGTH,
  MAX_SOCIAL_TITLE_LENGTH,
} from '@/lib/list-branding';

// --- Constants ---

export const MAX_URL_LENGTH = 2048;
export const MAX_LINKS = 500;
export const MAX_DESCRIPTION_LENGTH = 280;
export const MAX_OG_TITLE_LENGTH = 200;
export const MAX_OG_DESCRIPTION_LENGTH = 500;
export const MAX_OG_SITE_NAME_LENGTH = 100;
export const MAX_IMAGE_URL_LENGTH = 2048;

// --- Sanitization ---

/**
 * Strips HTML tags, decodes common entities, removes control characters,
 * and truncates to maxLength. Returns null for empty/missing values.
 */
export function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || !value) return null;

  const cleaned = value
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);

  return cleaned.length > 0 ? cleaned : null;
}

// --- Schemas ---

const LinkInputSchema = z.object({
  url: z.string().min(1),
  position: z.number().int().min(0),
  pinned: z.boolean().optional().default(false),
  ogTitle: z.string().nullable().optional(),
  ogDescription: z.string().nullable().optional(),
  ogImage: z.string().nullable().optional(),
  ogSiteName: z.string().nullable().optional(),
});

const BrandingInputSchema = z.object({
  publicTitle: z.string().max(MAX_PUBLIC_TITLE_LENGTH).nullable().optional(),
  socialTitle: z.string().max(MAX_SOCIAL_TITLE_LENGTH).nullable().optional(),
  socialDescription: z.string().max(MAX_SOCIAL_DESCRIPTION_LENGTH).nullable().optional(),
  coverImageUrl: z.string().max(MAX_IMAGE_URL_LENGTH).nullable().optional(),
  socialImageUrl: z.string().max(MAX_IMAGE_URL_LENGTH).nullable().optional(),
  appearance: z.object({
    theme: z.enum(LIST_THEME_OPTIONS.map((option) => option.value) as [typeof LIST_THEME_OPTIONS[number]['value'], ...typeof LIST_THEME_OPTIONS[number]['value'][]]).optional(),
    accent: z.enum(LIST_ACCENT_OPTIONS.map((option) => option.value) as [typeof LIST_ACCENT_OPTIONS[number]['value'], ...typeof LIST_ACCENT_OPTIONS[number]['value'][]]).optional(),
    layout: z.enum(LIST_LAYOUT_OPTIONS.map((option) => option.value) as [typeof LIST_LAYOUT_OPTIONS[number]['value'], ...typeof LIST_LAYOUT_OPTIONS[number]['value'][]]).optional(),
  }).optional(),
});

export const CreateListSchema = z.object({
  slug: z.string().optional(),
  description: z.string().optional().default(''),
  branding: BrandingInputSchema.optional().default({
    publicTitle: null,
    socialTitle: null,
    socialDescription: null,
    coverImageUrl: null,
    socialImageUrl: null,
    appearance: DEFAULT_LIST_APPEARANCE,
  }),
  links: z
    .array(LinkInputSchema)
    .min(1, 'List must contain at least one link')
    .max(MAX_LINKS, `List exceeds the maximum of ${MAX_LINKS} links`),
});

const UpdateLinkSchema = LinkInputSchema.extend({
  id: z.string().optional(),
});

export const UpdateListSchema = z.object({
  slug: z.string().optional(),
  description: z.string().optional(),
  branding: BrandingInputSchema.optional(),
  updatedAt: z.number(),
  links: z.array(UpdateLinkSchema).max(MAX_LINKS).optional(),
});
