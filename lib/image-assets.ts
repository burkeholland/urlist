import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
} from '@/lib/list-branding';
import { log } from '@/lib/logger';
import { fetchWithSafeRedirects } from '@/lib/network';
import type { ListImageAsset } from '@/lib/types';
import { normalizeUrl } from '@/lib/url';

const IMAGE_VALIDATION_TIMEOUT_MS = 5000;
const HEADER_BYTE_LIMIT = 64 * 1024;

type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

interface ImageDimensions {
  width: number;
  height: number;
}

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function detectContentType(bytes: Uint8Array): AllowedImageContentType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a'
  ) {
    return 'image/gif';
  }

  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a'
  ) {
    return 'image/gif';
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

function parsePngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) return null;
  return {
    width: readUInt32BE(bytes, 16),
    height: readUInt32BE(bytes, 20),
  };
}

function parseGifDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10) return null;
  return {
    width: readUInt16LE(bytes, 6),
    height: readUInt16LE(bytes, 8),
  };
}

function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = readUInt16BE(bytes, offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      return null;
    }

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: readUInt16BE(bytes, offset + 5),
        width: readUInt16BE(bytes, offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function parseWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const chunkType = String.fromCharCode(...bytes.slice(12, 16));

  if (chunkType === 'VP8X') {
    return {
      width: 1 + readUInt24LE(bytes, 24),
      height: 1 + readUInt24LE(bytes, 27),
    };
  }

  if (chunkType === 'VP8 ') {
    return {
      width: readUInt16LE(bytes, 26) & 0x3fff,
      height: readUInt16LE(bytes, 28) & 0x3fff,
    };
  }

  if (chunkType === 'VP8L') {
    const bits = readUInt32LE(bytes, 21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

function parseImageDimensions(
  contentType: AllowedImageContentType,
  bytes: Uint8Array,
): ImageDimensions | null {
  switch (contentType) {
    case 'image/png':
      return parsePngDimensions(bytes);
    case 'image/jpeg':
      return parseJpegDimensions(bytes);
    case 'image/gif':
      return parseGifDimensions(bytes);
    case 'image/webp':
      return parseWebpDimensions(bytes);
    default:
      return null;
  }
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseContentRangeTotal(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function getTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(IMAGE_VALIDATION_TIMEOUT_MS);
}

async function fetchImageHeaders(url: string): Promise<Response | null> {
  try {
    const { response } = await fetchWithSafeRedirects(url, {
      method: 'HEAD',
      signal: getTimeoutSignal(),
    });
    if (response.ok) {
      return response;
    }
    if (response.status !== 405 && response.status !== 501) {
      return response;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchImageBytes(url: string): Promise<Response> {
  const { response } = await fetchWithSafeRedirects(url, {
    method: 'GET',
    headers: {
      Range: `bytes=0-${HEADER_BYTE_LIMIT - 1}`,
    },
    signal: getTimeoutSignal(),
  });
  return response;
}

function getResponseContentType(
  response: Response,
  bytes: Uint8Array,
): AllowedImageContentType | null {
  const header = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (
    header &&
    ALLOWED_IMAGE_CONTENT_TYPES.includes(header as AllowedImageContentType)
  ) {
    return header as AllowedImageContentType;
  }
  return detectContentType(bytes);
}

function validateDimensions(dimensions: ImageDimensions): string | null {
  if (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT) {
    return `Image dimensions must be at least ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px.`;
  }
  if (
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION
  ) {
    return `Image dimensions must not exceed ${MAX_IMAGE_DIMENSION}px on either side.`;
  }
  return null;
}

export async function inspectRemoteImage(urlInput: string): Promise<{
  asset?: ListImageAsset;
  error?: string;
}> {
  const normalized = normalizeUrl(urlInput);
  if (!normalized.valid) {
    return { error: normalized.error || 'A valid image URL is required.' };
  }

  let headResponse: Response | null;
  try {
    headResponse = await fetchImageHeaders(normalized.url);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not fetch image metadata.',
    };
  }
  const knownSizeFromHead = parseContentLength(
    headResponse?.headers.get('content-length') ?? null,
  );

  if (knownSizeFromHead && knownSizeFromHead > MAX_IMAGE_BYTES) {
    return { error: `Image exceeds the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB limit.` };
  }

  let response: Response;
  try {
    response = await fetchImageBytes(normalized.url);
  } catch (error) {
    log({
      level: 'warn',
      message: 'Image validation fetch failed',
      service: 'image-assets',
      data: {
        url: normalized.url,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not fetch image metadata.',
    };
  }

  if (!response.ok && response.status !== 206) {
    return { error: 'Image URL did not return a readable image.' };
  }

  const totalSize =
    knownSizeFromHead ??
    parseContentLength(response.headers.get('content-length')) ??
    parseContentRangeTotal(response.headers.get('content-range'));

  if (!totalSize) {
    return { error: 'Image server must provide a file size for validation.' };
  }

  if (totalSize > MAX_IMAGE_BYTES) {
    return { error: `Image exceeds the ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB limit.` };
  }

  const bytes = toUint8Array(await response.arrayBuffer());
  const contentType = getResponseContentType(response, bytes);
  if (!contentType) {
    return {
      error: `Image must be one of: ${ALLOWED_IMAGE_CONTENT_TYPES.join(', ')}.`,
    };
  }

  const dimensions = parseImageDimensions(contentType, bytes);
  if (!dimensions) {
    return { error: 'Could not determine image dimensions.' };
  }

  const dimensionError = validateDimensions(dimensions);
  if (dimensionError) {
    return { error: dimensionError };
  }

  return {
    asset: {
      url: normalized.url,
      contentType,
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes: totalSize,
    },
  };
}
