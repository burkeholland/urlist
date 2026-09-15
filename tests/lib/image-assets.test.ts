import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectRemoteImage } from '@/lib/image-assets';
import { validateUrlNotPrivate } from '@/lib/network';

vi.mock('@/lib/network', () => ({
  validateUrlNotPrivate: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}));

function makePng(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff,
    (height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff,
  ]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe('inspectRemoteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateUrlNotPrivate).mockResolvedValue({ safe: true });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-length': '4096',
            'content-type': 'image/png',
          },
        });
      }
      return new Response(toArrayBuffer(makePng(1200, 630)), {
        status: 206,
        headers: {
          'content-length': '4096',
          'content-type': 'image/png',
          'content-range': 'bytes 0-4095/4096',
        },
      });
    }));
  });

  it('returns a normalized asset for a valid image', async () => {
    const result = await inspectRemoteImage('cdn.example.com/preview.png');
    expect(result).toEqual({
      asset: {
        url: 'https://cdn.example.com/preview.png',
        contentType: 'image/png',
        width: 1200,
        height: 630,
        sizeBytes: 4096,
      },
    });
  });

  it('rejects private or unresolved image URLs', async () => {
    vi.mocked(validateUrlNotPrivate).mockResolvedValueOnce({
      safe: false,
      error: 'URL resolves to a private/internal IP range.',
    });
    const result = await inspectRemoteImage('https://10.0.0.1/private.png');
    expect(result).toEqual({
      error: 'URL resolves to a private/internal IP range.',
    });
  });

  it('rejects images when the server does not expose a file size', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 405 });
      }
      return new Response(toArrayBuffer(makePng(1200, 630)), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      });
    }));
    const result = await inspectRemoteImage('https://cdn.example.com/size-less.png');
    expect(result).toEqual({
      error: 'Image server must provide a file size for validation.',
    });
  });

  it('rejects unsupported image types', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-length': '2048',
            'content-type': 'image/svg+xml',
          },
        });
      }
      return new Response('<svg></svg>', {
        status: 206,
        headers: {
          'content-length': '2048',
          'content-type': 'image/svg+xml',
          'content-range': 'bytes 0-2047/2048',
        },
      });
    }));
    const result = await inspectRemoteImage('https://cdn.example.com/preview.svg');
    expect(result).toEqual({
      error: 'Image must be one of: image/png, image/jpeg, image/webp, image/gif.',
    });
  });

  it('rejects images that are too small', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-length': '1024',
            'content-type': 'image/png',
          },
        });
      }
      return new Response(toArrayBuffer(makePng(200, 120)), {
        status: 206,
        headers: {
          'content-length': '1024',
          'content-type': 'image/png',
          'content-range': 'bytes 0-1023/1024',
        },
      });
    }));
    const result = await inspectRemoteImage('https://cdn.example.com/tiny.png');
    expect(result).toEqual({
      error: 'Image dimensions must be at least 320×180px.',
    });
  });
});
