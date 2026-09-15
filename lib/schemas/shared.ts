import { z } from 'zod';

// --- Constants ---

export const MAX_URL_LENGTH = 2048;
export const MAX_LINKS = 500;
export const MAX_DESCRIPTION_LENGTH = 280;
export const MAX_OG_TITLE_LENGTH = 200;
export const MAX_OG_DESCRIPTION_LENGTH = 500;
export const MAX_OG_SITE_NAME_LENGTH = 100;
export const MIN_LIST_PASSWORD_LENGTH = 8;
export const MAX_LIST_PASSWORD_LENGTH = 1024;

export const ListVisibilitySchema = z.enum(['public', 'unlisted', 'password-protected']);

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

export const CreateListSchema = z.object({
  slug: z.string().optional(),
  description: z.string().optional().default(''),
  visibility: ListVisibilitySchema.optional().default('public'),
  password: z.string().min(MIN_LIST_PASSWORD_LENGTH).max(MAX_LIST_PASSWORD_LENGTH).optional(),
  links: z
    .array(LinkInputSchema)
    .min(1, 'List must contain at least one link')
    .max(MAX_LINKS, `List exceeds the maximum of ${MAX_LINKS} links`),
}).superRefine((value, ctx) => {
  if (value.visibility === 'password-protected' && !value.password) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: 'Password is required for password-protected lists.',
    });
  }
  if (value.visibility !== 'password-protected' && value.password) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: 'Password can only be set for password-protected lists.',
    });
  }
});

const UpdateLinkSchema = LinkInputSchema.extend({
  id: z.string().optional(),
});

export const UpdateListSchema = z.object({
  slug: z.string().optional(),
  description: z.string().optional(),
  visibility: ListVisibilitySchema.optional(),
  password: z.string().min(MIN_LIST_PASSWORD_LENGTH).max(MAX_LIST_PASSWORD_LENGTH).optional(),
  updatedAt: z.number(),
  links: z.array(UpdateLinkSchema).max(MAX_LINKS).optional(),
}).superRefine((value, ctx) => {
  if (value.visibility && value.visibility !== 'password-protected' && value.password) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: 'Password can only be set for password-protected lists.',
    });
  }
});
