import { describe, expect, it, vi } from 'vitest';
import {
  copyText,
  legacyCopyToClipboard,
  shareContent,
  supportsClipboardApi,
  supportsWebShare,
} from '@/lib/share';

describe('supportsClipboardApi', () => {
  it('returns true when navigator.clipboard.writeText is available', () => {
    expect(supportsClipboardApi({ clipboard: { writeText: vi.fn() } })).toBe(true);
  });

  it('returns false when clipboard support is unavailable', () => {
    expect(supportsClipboardApi({})).toBe(false);
    expect(supportsClipboardApi(null)).toBe(false);
  });
});

describe('supportsWebShare', () => {
  it('returns true when share is present and canShare is absent', () => {
    expect(supportsWebShare({ share: vi.fn() }, { url: 'https://example.com' })).toBe(true);
  });

  it('defers to canShare when present', () => {
    expect(
      supportsWebShare(
        { share: vi.fn(), canShare: vi.fn().mockReturnValue(false) },
        { url: 'https://example.com' },
      ),
    ).toBe(false);
  });
});

describe('legacyCopyToClipboard', () => {
  it('copies via execCommand and always cleans up the textarea', () => {
    const appended: unknown[] = [];
    const removed: unknown[] = [];
    const select = vi.fn();
    const textarea = {
      value: '',
      setAttribute: vi.fn(),
      style: { position: '', left: '', top: '' },
      select,
    };

    const copied = legacyCopyToClipboard('hello', {
      body: {
        appendChild: vi.fn((node) => appended.push(node)),
        removeChild: vi.fn((node) => removed.push(node)),
      },
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true),
    });

    expect(copied).toBe(true);
    expect(textarea.value).toBe('hello');
    expect(select).toHaveBeenCalledOnce();
    expect(appended).toEqual([textarea]);
    expect(removed).toEqual([textarea]);
  });
});

describe('copyText', () => {
  it('uses navigator.clipboard when supported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyText('hello', { navigatorLike: { clipboard: { writeText } } })).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back when clipboard is unavailable', async () => {
    const legacyCopy = vi.fn().mockReturnValue(true);
    await expect(copyText('hello', { legacyCopy })).resolves.toBe('fallback');
    expect(legacyCopy).toHaveBeenCalledWith('hello');
  });

  it('throws when both clipboard paths are unavailable', async () => {
    await expect(copyText('hello')).rejects.toThrow('Clipboard is unavailable in this browser.');
  });
});

describe('shareContent', () => {
  it('invokes navigator.share when supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    await expect(
      shareContent(
        { share, canShare: vi.fn().mockReturnValue(true) },
        { url: 'https://example.com' },
      ),
    ).resolves.toBeUndefined();
    expect(share).toHaveBeenCalledWith({ url: 'https://example.com' });
  });

  it('throws when the Web Share API is unsupported', async () => {
    await expect(shareContent({}, { url: 'https://example.com' })).rejects.toThrow(
      'Native sharing is unavailable in this browser.',
    );
  });
});
