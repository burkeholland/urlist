import { inspectRemoteImage } from '@/lib/image-assets';
import {
  MAX_PUBLIC_TITLE_LENGTH,
  MAX_SOCIAL_DESCRIPTION_LENGTH,
  MAX_SOCIAL_TITLE_LENGTH,
  normalizeAppearance,
  normalizeListBranding,
} from '@/lib/list-branding';
import { sanitizeText } from '@/lib/schemas/shared';
import type { ListAppearanceSettings, ListBranding } from '@/lib/types';

export class BrandingValidationError extends Error {
  code: 'INVALID_COVER_IMAGE' | 'INVALID_SOCIAL_IMAGE';

  constructor(
    code: 'INVALID_COVER_IMAGE' | 'INVALID_SOCIAL_IMAGE',
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'BrandingValidationError';
  }
}

interface BrandingInput {
  publicTitle?: string | null;
  socialTitle?: string | null;
  socialDescription?: string | null;
  coverImageUrl?: string | null;
  socialImageUrl?: string | null;
  appearance?: Partial<ListAppearanceSettings>;
}

async function validateOptionalImage(
  field: 'coverImage' | 'socialImage',
  url: string | null | undefined,
) {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  const result = await inspectRemoteImage(trimmed);
  if (!result.asset) {
    throw new BrandingValidationError(
      field === 'coverImage' ? 'INVALID_COVER_IMAGE' : 'INVALID_SOCIAL_IMAGE',
      result.error || 'Invalid image.',
    );
  }
  return result.asset;
}

export async function sanitizeBrandingInput(
  input?: BrandingInput | null,
): Promise<ListBranding> {
  return normalizeListBranding({
    publicTitle: sanitizeText(input?.publicTitle, MAX_PUBLIC_TITLE_LENGTH),
    socialTitle: sanitizeText(input?.socialTitle, MAX_SOCIAL_TITLE_LENGTH),
    socialDescription: sanitizeText(
      input?.socialDescription,
      MAX_SOCIAL_DESCRIPTION_LENGTH,
    ),
    coverImage: await validateOptionalImage('coverImage', input?.coverImageUrl),
    socialImage: await validateOptionalImage('socialImage', input?.socialImageUrl),
    appearance: normalizeAppearance(input?.appearance),
  });
}
