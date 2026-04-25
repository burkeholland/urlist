import { describe, it, expect } from 'vitest';
import { validateSlugFormat, encodeSlugForKey, decodeSlugFromKey, generateSlug, generateListId, generateLinkId } from '@/lib/slug';

describe('validateSlugFormat', () => {
  it('accepts empty string (auto-generate)', () => {
    expect(validateSlugFormat('')).toEqual({ valid: true });
  });

  it('accepts valid lowercase alphanumeric slug', () => {
    expect(validateSlugFormat('my-list')).toEqual({ valid: true });
  });

  it('accepts slugs with slashes', () => {
    expect(validateSlugFormat('my/nested/list')).toEqual({ valid: true });
  });

  it('accepts underscores', () => {
    expect(validateSlugFormat('my_list')).toEqual({ valid: true });
  });

  it('rejects uppercase', () => {
    const result = validateSlugFormat('MyList');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/lowercase/i);
  });

  it('rejects slugs over 200 chars', () => {
    const result = validateSlugFormat('a'.repeat(201));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/200/);
  });

  it('rejects consecutive slashes', () => {
    const result = validateSlugFormat('a//b');
    expect(result.valid).toBe(false);
  });

  it('rejects leading slash', () => {
    const result = validateSlugFormat('/a');
    expect(result.valid).toBe(false);
  });

  it('rejects trailing slash', () => {
    const result = validateSlugFormat('a/');
    expect(result.valid).toBe(false);
  });

  it('rejects reserved prefix "app"', () => {
    const result = validateSlugFormat('app');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/reserved/);
  });

  it('rejects reserved prefix "api"', () => {
    const result = validateSlugFormat('api');
    expect(result.valid).toBe(false);
  });

  it('rejects reserved exact "favicon.ico"', () => {
    const result = validateSlugFormat('favicon.ico');
    expect(result.valid).toBe(false);
  });

  it('rejects invalid characters (spaces, special chars)', () => {
    expect(validateSlugFormat('my list').valid).toBe(false);
    expect(validateSlugFormat('my@list').valid).toBe(false);
    expect(validateSlugFormat('my#list').valid).toBe(false);
  });

  it('allows app as a non-first segment', () => {
    expect(validateSlugFormat('my/app/list')).toEqual({ valid: true });
  });
});

describe('encodeSlugForKey / decodeSlugFromKey', () => {
  it('encodes slashes to tildes', () => {
    expect(encodeSlugForKey('a/b/c')).toBe('a~b~c');
  });

  it('decodes tildes to slashes', () => {
    expect(decodeSlugFromKey('a~b~c')).toBe('a/b/c');
  });

  it('roundtrips', () => {
    const slug = 'my/nested/list';
    expect(decodeSlugFromKey(encodeSlugForKey(slug))).toBe(slug);
  });

  it('leaves plain slugs unchanged', () => {
    expect(encodeSlugForKey('my-list')).toBe('my-list');
  });
});

describe('generateSlug', () => {
  it('returns 8-char lowercase string', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(8);
    expect(slug).toBe(slug.toLowerCase());
  });

  it('generates unique values', () => {
    const slugs = new Set(Array.from({ length: 100 }, () => generateSlug()));
    expect(slugs.size).toBe(100);
  });
});

describe('generateListId', () => {
  it('returns 12-char string', () => {
    expect(generateListId()).toHaveLength(12);
  });
});

describe('generateLinkId', () => {
  it('returns 10-char string', () => {
    expect(generateLinkId()).toHaveLength(10);
  });
});
