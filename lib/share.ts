export interface ClipboardApiLike {
  writeText(text: string): Promise<void>;
}

export interface ShareDataLike {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareNavigatorLike {
  clipboard?: ClipboardApiLike;
  share?: (data: ShareDataLike) => Promise<void>;
  canShare?: (data?: ShareDataLike) => boolean;
}

export interface LegacyCopyDocumentLike {
  body: {
    appendChild(node: unknown): unknown;
    removeChild(node: unknown): unknown;
  };
  createElement(tagName: 'textarea'): {
    value: string;
    setAttribute(name: string, value: string): void;
    style: { position: string; left: string; top: string };
    select(): void;
  };
  execCommand?(command: 'copy'): boolean;
}

export function supportsClipboardApi(navigatorLike?: ShareNavigatorLike | null): boolean {
  return typeof navigatorLike?.clipboard?.writeText === 'function';
}

export function supportsWebShare(
  navigatorLike: ShareNavigatorLike | null | undefined,
  data: ShareDataLike,
): boolean {
  if (typeof navigatorLike?.share !== 'function') {
    return false;
  }

  if (typeof navigatorLike.canShare === 'function') {
    return navigatorLike.canShare(data);
  }

  return true;
}

export function legacyCopyToClipboard(
  text: string,
  documentLike: LegacyCopyDocumentLike,
): boolean {
  const textarea = documentLike.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  documentLike.body.appendChild(textarea);
  textarea.select();

  try {
    return documentLike.execCommand?.('copy') ?? false;
  } finally {
    documentLike.body.removeChild(textarea);
  }
}

export async function copyText(
  text: string,
  options: {
    navigatorLike?: ShareNavigatorLike | null;
    legacyCopy?: ((value: string) => boolean | Promise<boolean>) | null;
  } = {},
): Promise<'clipboard' | 'fallback'> {
  if (supportsClipboardApi(options.navigatorLike)) {
    await options.navigatorLike!.clipboard!.writeText(text);
    return 'clipboard';
  }

  if (options.legacyCopy) {
    const copied = await options.legacyCopy(text);
    if (copied) {
      return 'fallback';
    }
  }

  throw new Error('Clipboard is unavailable in this browser.');
}

export async function shareContent(
  navigatorLike: ShareNavigatorLike | null | undefined,
  data: ShareDataLike,
): Promise<void> {
  if (!supportsWebShare(navigatorLike, data)) {
    throw new Error('Native sharing is unavailable in this browser.');
  }

  await navigatorLike!.share!(data);
}
