import { describe, it, expect } from 'vitest';
import { normalizeUrl, isValidHttpUrl } from '@/lib/url';

describe('normalizeUrl', () => {
  it('accepts valid https URL', () => {
    const result = normalizeUrl('https://example.com');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  it('accepts valid http URL', () => {
    const result = normalizeUrl('http://example.com');
    expect(result.valid).toBe(true);
  });

  it('prepends https to bare domains', () => {
    const result = normalizeUrl('example.com');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  it('prepends https to bare domains with paths', () => {
    const result = normalizeUrl('example.com/path');
    expect(result.valid).toBe(true);
    expect(result.url).toContain('https://');
  });

  it('rejects empty string', () => {
    const result = normalizeUrl('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL is required.');
  });

  it('rejects whitespace-only', () => {
    const result = normalizeUrl('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL is required.');
  });

  it('accepts a URL at exactly the 2048-char limit', () => {
    const url = 'https://example.com/' + 'a'.repeat(2048 - 'https://example.com/'.length);
    const result = normalizeUrl(url);
    expect(result.valid).toBe(true);
  });

  it('rejects a bare domain that ends with a dash before the TLD', () => {
    // The second label group requires ending in alphanumeric
    const result = normalizeUrl('a-.com');
    expect(result.valid).toBe(false);
  });

  it('rejects inputs that partially match a domain (regex must be anchored)', () => {
    expect(normalizeUrl('not a url but example.com!').valid).toBe(false);
    expect(normalizeUrl('see example.com/path here').valid).toBe(false);
  });

  it('requires a dot-separated TLD of at least two letters', () => {
    expect(normalizeUrl('example.c').valid).toBe(false);
    expect(normalizeUrl('example').valid).toBe(false);
  });

  it('blocks javascript: protocol', () => {
    const result = normalizeUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('"javascript:" URLs are not allowed.');
  });

  it('blocks data: protocol', () => {
    const result = normalizeUrl('data:text/html,<h1>hi</h1>');
    expect(result.valid).toBe(false);
  });

  it('blocks file: protocol', () => {
    const result = normalizeUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
  });

  it('blocks mailto: protocol', () => {
    const result = normalizeUrl('mailto:user@example.com');
    expect(result.valid).toBe(false);
  });

  it('blocks ftp: protocol', () => {
    const result = normalizeUrl('ftp://example.com');
    expect(result.valid).toBe(false);
  });

  it('blocks blob: protocol', () => {
    const result = normalizeUrl('blob:http://example.com/uuid');
    expect(result.valid).toBe(false);
  });

  it('rejects random gibberish', () => {
    const result = normalizeUrl('not a url at all!');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid URL format.');
  });

  it('trims whitespace', () => {
    const result = normalizeUrl('  https://example.com  ');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  it('preserves path, query, and fragment', () => {
    const result = normalizeUrl('https://example.com/path?q=1#frag');
    expect(result.valid).toBe(true);
    expect(result.url).toContain('/path?q=1#frag');
  });

  it('rejects URLs exceeding 2048 chars', () => {
    const result = normalizeUrl('https://example.com/' + 'a'.repeat(2040));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL exceeds maximum length of 2048 characters.');
  });

  it('rejects JAVASCRIPT: with mixed case', () => {
    const result = normalizeUrl('JaVaScRiPt:alert(1)');
    expect(result.valid).toBe(false);
  });

  it('rejects protocol with leading whitespace after trim', () => {
    const result = normalizeUrl('  javascript:alert(1)');
    expect(result.valid).toBe(false);
  });

  it('rejects https:// with no host', () => {
    const result = normalizeUrl('https://');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid URL format.');
  });

  it('rejects URLs with disallowed protocols not in the blocklist', () => {
    const result = normalizeUrl('custom://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Only http and https URLs are allowed.');
  });

  it('handles URLs with ports', () => {
    const result = normalizeUrl('https://example.com:8080/path');
    expect(result.valid).toBe(true);
    expect(result.url).toContain(':8080');
  });

  it('handles URLs with authentication info', () => {
    const result = normalizeUrl('https://user:pass@example.com');
    expect(result.valid).toBe(true);
  });

  it('handles internationalized domain names', () => {
    const result = normalizeUrl('https://例え.jp');
    expect(result.valid).toBe(true);
  });
  it('rejects URLs with disallowed protocols not in the blocklist', () => {
    const result = normalizeUrl('custom://example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Only http and https URLs are allowed.');
  });
});

describe('isValidHttpUrl', () => {
  it('returns true for https', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true);
  });

  it('returns true for http', () => {
    expect(isValidHttpUrl('http://example.com')).toBe(true);
  });

  it('returns false for ftp', () => {
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isValidHttpUrl('not-a-url')).toBe(false);
  });

  it('returns false for javascript:', () => {
    expect(isValidHttpUrl('javascript:void(0)')).toBe(false);
  });
});
