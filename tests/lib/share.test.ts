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
  function createDocument(overrides: Record<string, unknown> = {}) {
    const textarea = {
      value: '',
      setAttribute: vi.fn(),
      style: { position: '', left: '', top: '' },
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };
    const body = { appendChild: vi.fn(), removeChild: vi.fn() };
    const documentLike = {
      body,
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true),
      ...overrides,
    };
    return { textarea, body, documentLike };
  }

  it('copies via execCommand and always cleans up the textarea', () => {
    const { textarea, body, documentLike } = createDocument();

    const copied = legacyCopyToClipboard('hello', documentLike);

    expect(copied).toBe(true);
    expect(textarea.value).toBe('hello');
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(0, 5);
    expect(body.appendChild).toHaveBeenCalledWith(textarea);
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it('returns focus to the previously focused element', () => {
    const previouslyFocused = { focus: vi.fn() };
    const { documentLike } = createDocument({ activeElement: previouslyFocused });

    legacyCopyToClipboard('hello', documentLike);

    expect(previouslyFocused.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('reports failure and still cleans up when execCommand throws', () => {
    const previouslyFocused = { focus: vi.fn() };
    const { body, textarea, documentLike } = createDocument({
      activeElement: previouslyFocused,
      execCommand: vi.fn(() => {
        throw new Error('blocked');
      }),
    });

    expect(legacyCopyToClipboard('hello', documentLike)).toBe(false);
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
    expect(previouslyFocused.focus).toHaveBeenCalledOnce();
  });

  it('reports failure when execCommand is unavailable or declines', () => {
    expect(legacyCopyToClipboard('hello', createDocument({ execCommand: undefined }).documentLike)).toBe(false);
    expect(legacyCopyToClipboard('hello', createDocument({ execCommand: vi.fn(() => false) }).documentLike)).toBe(false);
  });

  it('tolerates elements without optional focus and selection helpers', () => {
    const { textarea, documentLike } = createDocument({ activeElement: {} });
    Object.assign(textarea, { focus: undefined, setSelectionRange: undefined });

    expect(legacyCopyToClipboard('hello', documentLike)).toBe(true);
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

  it('falls back when the Clipboard API exists but rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const legacyCopy = vi.fn().mockResolvedValue(true);

    await expect(
      copyText('hello', { navigatorLike: { clipboard: { writeText } }, legacyCopy }),
    ).resolves.toBe('fallback');
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(legacyCopy).toHaveBeenCalledWith('hello');
  });

  it('throws when the Clipboard API rejects and there is no fallback', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    await expect(copyText('hello', { navigatorLike: { clipboard: { writeText } } })).rejects.toThrow(
      'Clipboard is unavailable in this browser.',
    );
  });

  it('throws when the fallback declines to copy', async () => {
    await expect(copyText('hello', { legacyCopy: () => false })).rejects.toThrow(
      'Clipboard is unavailable in this browser.',
    );
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

  it('refuses data that canShare rejects without calling share', async () => {
    const share = vi.fn();
    await expect(
      shareContent({ share, canShare: () => false }, { url: 'https://example.com' }),
    ).rejects.toThrow('Native sharing is unavailable in this browser.');
    expect(share).not.toHaveBeenCalled();
  });

  it('propagates rejections so callers can tell a dismissed sheet from a failure', async () => {
    const abort = new DOMException('dismissed', 'AbortError');
    await expect(
      shareContent({ share: vi.fn().mockRejectedValue(abort) }, { url: 'https://example.com' }),
    ).rejects.toBe(abort);
  });
});
