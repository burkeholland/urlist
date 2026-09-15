import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { getAuthSecret } from '@/lib/auth';
import { normalizeCapturedUrl } from '@/lib/url';
import {
  MAX_OG_DESCRIPTION_LENGTH,
  MAX_OG_TITLE_LENGTH,
  MAX_URL_LENGTH,
  sanitizeText,
} from '@/lib/schemas/shared';

export const CAPTURE_STAGE_COOKIE = 'capture_stage';

const CaptureSourceSchema = z.enum(['bookmarklet', 'share-target']);

const CaptureStateSchema = z.object({
  url: z.string().min(1).max(MAX_URL_LENGTH),
  title: z.string().max(MAX_OG_TITLE_LENGTH).nullable(),
  text: z.string().max(MAX_OG_DESCRIPTION_LENGTH).nullable(),
  source: CaptureSourceSchema,
});

export type StagedCapturePayload = z.infer<typeof CaptureStateSchema>;
export type CaptureSource = z.infer<typeof CaptureSourceSchema>;

function trimString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildStagedCapturePayload(params: {
  url: FormDataEntryValue | null;
  title: FormDataEntryValue | null;
  text: FormDataEntryValue | null;
  source: string | null | undefined;
}): StagedCapturePayload | null {
  const urlCandidate = trimString(params.url) || trimString(params.text);
  if (!urlCandidate) {
    return null;
  }

  const normalizedUrl = normalizeCapturedUrl(urlCandidate);
  if (!normalizedUrl.valid) {
    return null;
  }

  const textCandidate = trimString(params.text);
  const normalizedText = sanitizeText(
    textCandidate && textCandidate !== urlCandidate ? textCandidate : null,
    MAX_OG_DESCRIPTION_LENGTH,
  );

  const payload = {
    url: normalizedUrl.url.slice(0, MAX_URL_LENGTH),
    title: sanitizeText(trimString(params.title), MAX_OG_TITLE_LENGTH),
    text: normalizedText,
    source: params.source === 'bookmarklet' ? 'bookmarklet' : 'share-target',
  } satisfies StagedCapturePayload;

  const parsed = CaptureStateSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export async function createCaptureStateToken(payload: StagedCapturePayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getAuthSecret());
}

export async function readCaptureStateToken(token: string | undefined): Promise<StagedCapturePayload | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    const parsed = CaptureStateSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
