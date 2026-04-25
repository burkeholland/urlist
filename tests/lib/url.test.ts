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
  });

  it('rejects whitespace-only', () => {
    const result = normalizeUrl('   ');
    expect(result.valid).toBe(false);
  });

  it('blocks javascript: protocol', () => {
    const result = normalizeUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not allowed/i);
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
    expect(result.error).toMatch(/maximum length/);
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
