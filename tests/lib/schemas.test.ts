import { describe, it, expect } from 'vitest';
import { CreateListSchema, MAX_LINKS, UpdateListSchema, sanitizeText } from '@/lib/schemas/shared';

const link = (overrides = {}) => ({
  url: 'https://example.com',
  position: 0,
  ...overrides,
});

describe('sanitizeText', () => {
  it('returns null for non-string values', () => {
    expect(sanitizeText(undefined, 10)).toBeNull();
    expect(sanitizeText(null, 10)).toBeNull();
    expect(sanitizeText(123, 10)).toBeNull();
    expect(sanitizeText({}, 10)).toBeNull();
  });

  it('returns null for empty strings and strings empty after cleaning', () => {
    expect(sanitizeText('', 10)).toBeNull();
    expect(sanitizeText('   ', 10)).toBeNull();
    expect(sanitizeText('<b></b>\u0000', 10)).toBeNull();
  });

  it('strips HTML tags', () => {
    expect(sanitizeText('<p>Hello <strong>world</strong></p>', 50)).toBe('Hello world');
  });

  it('decodes common HTML entities', () => {
    expect(sanitizeText('&amp; &lt; &gt; &quot; &#x27; &#x2F;', 50)).toBe('& < > " \' /');
  });

  it('removes control characters', () => {
    expect(sanitizeText('a\u0000b\u0008c\u007fd', 50)).toBe('abcd');
  });

  it('truncates to maxLength and trims whitespace', () => {
    expect(sanitizeText('  abcdef  ', 3)).toBe('abc');
  });
});

describe('CreateListSchema', () => {
  it('accepts valid input with slug, description, and links', () => {
    const result = CreateListSchema.parse({
      slug: 'my-list',
      description: 'Links',
      links: [link({ pinned: true })],
    });
    expect(result.description).toBe('Links');
    expect(result.links[0].pinned).toBe(true);
  });

  it('defaults description to empty string', () => {
    expect(CreateListSchema.parse({ links: [link()] }).description).toBe('');
  });

  it('requires at least one link', () => {
    expect(() => CreateListSchema.parse({ links: [] })).toThrow();
  });

  it('rejects more than 500 links', () => {
    expect(() => CreateListSchema.parse({ links: Array.from({ length: MAX_LINKS + 1 }, (_, i) => link({ position: i })) })).toThrow();
  });

  it('validates link url is required', () => {
    expect(() => CreateListSchema.parse({ links: [link({ url: '' })] })).toThrow();
  });

  it('validates link position is an integer greater than or equal to zero', () => {
    expect(() => CreateListSchema.parse({ links: [link({ position: 1.5 })] })).toThrow();
    expect(() => CreateListSchema.parse({ links: [link({ position: -1 })] })).toThrow();
  });

  it('accepts start-only, end-only, and bounded scheduled links', () => {
    expect(CreateListSchema.parse({
      links: [link({ visibleFrom: 1000, visibleTimezone: 'America/Chicago' })],
    }).links[0].visibleFrom).toBe(1000);
    expect(CreateListSchema.parse({
      links: [link({ visibleUntil: 2000, visibleTimezone: 'UTC' })],
    }).links[0].visibleUntil).toBe(2000);
    expect(CreateListSchema.parse({
      links: [link({ visibleFrom: 1000, visibleUntil: 2000, visibleTimezone: 'Europe/London' })],
    }).links[0].visibleTimezone).toBe('Europe/London');
  });

  it('rejects invalid scheduled link ranges and time zones', () => {
    expect(() => CreateListSchema.parse({
      links: [link({ visibleFrom: 2000, visibleUntil: 1000, visibleTimezone: 'UTC' })],
    })).toThrow(/after visible from/);
    expect(() => CreateListSchema.parse({
      links: [link({ visibleFrom: 1000 })],
    })).toThrow(/display time zone/);
    expect(() => CreateListSchema.parse({
      links: [link({ visibleFrom: 1000, visibleTimezone: 'Mars\\/Olympus' })],
    })).toThrow(/valid display time zone/);
  });
});

describe('UpdateListSchema', () => {
  it('requires updatedAt', () => {
    expect(() => UpdateListSchema.parse({ description: 'changed' })).toThrow();
  });

  it('accepts optional description and links', () => {
    const result = UpdateListSchema.parse({ updatedAt: 1, description: 'changed' });
    expect(result.links).toBeUndefined();
  });

  it('allows update links to include an optional id field', () => {
    const result = UpdateListSchema.parse({ updatedAt: 1, links: [link({ id: 'link-1' })] });
    expect(result.links?.[0].id).toBe('link-1');
  });

  it('validates scheduled links on update', () => {
    const result = UpdateListSchema.parse({
      updatedAt: 1,
      links: [link({ id: 'link-1', visibleFrom: 1000, visibleUntil: 2000, visibleTimezone: 'UTC' })],
    });
    expect(result.links?.[0].visibleUntil).toBe(2000);
    expect(() => UpdateListSchema.parse({
      updatedAt: 1,
      links: [link({ visibleFrom: 2000, visibleUntil: 1000, visibleTimezone: 'UTC' })],
    })).toThrow(/after visible from/);
  });
});
