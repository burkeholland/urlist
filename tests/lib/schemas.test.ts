import { describe, it, expect } from 'vitest';
import {
  CreateListSchema,
  MAX_LINKS,
  MAX_LIST_PASSWORD_LENGTH,
  MIN_LIST_PASSWORD_LENGTH,
  UnlockListSchema,
  UpdateListSchema,
  sanitizeText,
} from '@/lib/schemas/shared';

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
});

describe('list visibility and password schemas', () => {
  const issuePaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
    result.error?.issues.map((issue) => issue.path.join('.'));

  it('publishes new lists as public by default', () => {
    const result = CreateListSchema.parse({ links: [link()] });
    expect(result.visibility).toBe('public');
    expect(result.password).toBeUndefined();
  });

  it('accepts password-protected lists that include a password', () => {
    const result = CreateListSchema.parse({ visibility: 'password-protected', password: 'x'.repeat(MIN_LIST_PASSWORD_LENGTH), links: [link()] });
    expect(result.visibility).toBe('password-protected');
  });

  it('requires a password for password-protected lists', () => {
    const result = CreateListSchema.safeParse({ visibility: 'password-protected', links: [link()] });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(['password']);
  });

  it('rejects passwords on lists that are not password-protected', () => {
    for (const visibility of ['public', 'unlisted']) {
      const result = CreateListSchema.safeParse({ visibility, password: 'long-enough', links: [link()] });
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toEqual(['password']);
    }
  });

  it('enforces password length bounds', () => {
    const create = (password: string) => CreateListSchema.safeParse({ visibility: 'password-protected', password, links: [link()] });
    expect(create('x'.repeat(MIN_LIST_PASSWORD_LENGTH - 1)).success).toBe(false);
    expect(create('x'.repeat(MAX_LIST_PASSWORD_LENGTH)).success).toBe(true);
    expect(create('x'.repeat(MAX_LIST_PASSWORD_LENGTH + 1)).success).toBe(false);
  });

  it('rejects unknown visibility values', () => {
    expect(CreateListSchema.safeParse({ visibility: 'private', links: [link()] }).success).toBe(false);
    expect(UpdateListSchema.safeParse({ updatedAt: 1, visibility: 'private' }).success).toBe(false);
  });

  it('rejects an update that pairs a password with a visibility that cannot use it', () => {
    const result = UpdateListSchema.safeParse({ updatedAt: 1, visibility: 'unlisted', password: 'long-enough' });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(['password']);
  });

  it('leaves a password-only update for the route to check against the stored visibility', () => {
    expect(UpdateListSchema.parse({ updatedAt: 1, password: 'long-enough' }).password).toBe('long-enough');
    expect(UpdateListSchema.parse({ updatedAt: 1, visibility: 'password-protected', password: 'long-enough' }).visibility)
      .toBe('password-protected');
  });

  it('requires a slug and a bounded, non-empty password to unlock', () => {
    expect(UnlockListSchema.safeParse({ slug: 'my-list', password: 'p' }).success).toBe(true);
    expect(UnlockListSchema.safeParse({ slug: '', password: 'p' }).success).toBe(false);
    expect(UnlockListSchema.safeParse({ slug: 'my-list', password: '' }).success).toBe(false);
    expect(UnlockListSchema.safeParse({ slug: 'my-list', password: 'x'.repeat(MAX_LIST_PASSWORD_LENGTH + 1) }).success).toBe(false);
    expect(UnlockListSchema.safeParse(null).success).toBe(false);
  });
});
