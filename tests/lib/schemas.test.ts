import { describe, it, expect } from 'vitest';
import { CreateListSchema, MAX_LINKS, UpdateListSchema, sanitizeText } from '@/lib/schemas/shared';
import { MAX_SECTION_NAME_LENGTH, MAX_SECTIONS } from '@/lib/sections';

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

  it('accepts sections and section IDs on links', () => {
    const result = CreateListSchema.parse({
      sections: [{ id: 'section_1', name: 'Resources', position: 0 }],
      links: [link({ sectionId: 'section_1' })],
    });
    expect(result.sections?.[0].name).toBe('Resources');
    expect(result.links[0].sectionId).toBe('section_1');
  });

  it('enforces section count, name, id, and position limits', () => {
    expect(() => CreateListSchema.parse({
      sections: Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({ id: `s${i}`, name: 'S', position: i })),
      links: [link()],
    })).toThrow();
    expect(() => CreateListSchema.parse({ sections: [{ id: 'bad id', name: 'S', position: 0 }], links: [link()] })).toThrow();
    expect(() => CreateListSchema.parse({ sections: [{ id: 's', name: '', position: 0 }], links: [link()] })).toThrow();
    expect(() => CreateListSchema.parse({ sections: [{ id: 's', name: 'x'.repeat(MAX_SECTION_NAME_LENGTH + 1), position: 0 }], links: [link()] })).toThrow();
    expect(() => CreateListSchema.parse({ sections: [{ id: 's', name: 'S', position: -1 }], links: [link()] })).toThrow();
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

  it('accepts sections during updates', () => {
    const result = UpdateListSchema.parse({
      updatedAt: 1,
      sections: [{ id: 'a', name: 'A', position: 0 }],
      links: [link({ id: 'link-1', sectionId: 'a' })],
    });
    expect(result.sections?.[0].id).toBe('a');
    expect(result.links?.[0].sectionId).toBe('a');
  });
});
