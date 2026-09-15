import { describe, expect, it } from 'vitest';
import {
  CollectionImportError,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  escapeCsvCell,
  parseCollectionImport,
  serializeCollectionCsv,
  serializeCollectionHtml,
  serializeCollectionJson,
} from '@/lib/collection-io';
import type { ListWithLinks } from '@/lib/types';

const list: ListWithLinks = {
  listId: 'list-1',
  slug: 'my/list',
  description: 'Useful links',
  ownerId: 'owner-1',
  createdAt: 1,
  updatedAt: 2,
  links: [
    {
      id: 'old-2',
      url: 'https://second.example.com/',
      position: 1,
      pinned: false,
      folder: null,
      ogTitle: '<Second>',
      ogDescription: 'Description',
      ogImage: null,
      ogSiteName: null,
      createdAt: 1,
    },
    {
      id: 'old-1',
      url: 'https://first.example.com/',
      position: 0,
      pinned: true,
      folder: 'Research',
      ogTitle: '=SUM(1,1)',
      ogDescription: '+formula',
      ogImage: 'https://cdn.example.com/a.png',
      ogSiteName: 'Example',
      createdAt: 1,
    },
  ],
};

describe('parseCollectionImport', () => {
  it('previews valid, invalid, duplicate, and existing plain-text URL rows deterministically', () => {
    const preview = parseCollectionImport(
      [
        'example.com',
        'not a url',
        'https://example.com',
        'https://existing.example.com',
      ].join('\n'),
      { existingUrls: ['existing.example.com'], currentLinkCount: 1 },
    );

    expect(preview.format).toBe('text');
    expect(preview.valid.map((row) => [row.sourceRow, row.url])).toEqual([
      [1, 'https://example.com/'],
    ]);
    expect(preview.invalid).toEqual([
      expect.objectContaining({ sourceRow: 2, reason: 'Invalid URL format.' }),
    ]);
    expect(preview.duplicates).toEqual([
      expect.objectContaining({ sourceRow: 3, reason: 'duplicate_in_file', duplicateOf: 1 }),
      expect.objectContaining({ sourceRow: 4, reason: 'already_in_list' }),
    ]);
    expect(preview.summary).toMatchObject({
      totalRows: 4,
      validRows: 1,
      invalidRows: 1,
      duplicateRows: 2,
    });
  });

  it('parses CSV metadata, pinned state, folder data, and formula-looking cells safely', () => {
    const preview = parseCollectionImport(
      'url,title,description,folder,pinned\nexample.com,=Title,+Desc,@Folder,true',
      { format: 'csv' },
    );

    expect(preview.valid).toEqual([
      expect.objectContaining({
        url: 'https://example.com/',
        title: "'=Title",
        description: "'+Desc",
        folder: "'@Folder",
        pinned: true,
      }),
    ]);
  });

  it('supports headerless CSV with URL in the first column', () => {
    const preview = parseCollectionImport('example.com,Title,Description,Folder,yes', { format: 'csv' });
    expect(preview.valid[0]).toMatchObject({
      url: 'https://example.com/',
      title: 'Title',
      description: 'Description',
      folder: 'Folder',
      pinned: true,
    });
  });

  it('parses Netscape bookmark HTML titles, descriptions, folders, and entities', () => {
    const preview = parseCollectionImport(
      [
        '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        '<DL><p>',
        '<DT><H3>Research &amp; Docs</H3>',
        '<DL><p>',
        '<DT><A HREF="https://example.com/docs">&lt;Docs&gt;</A>',
        '<DD>Reference &amp; notes',
        '</DL><p>',
        '</DL><p>',
      ].join('\n'),
    );

    expect(preview.format).toBe('html');
    expect(preview.valid[0]).toMatchObject({
      sourceRow: 5,
      url: 'https://example.com/docs',
      title: '<Docs>',
      description: 'Reference & notes',
      folder: 'Research & Docs',
    });
  });

  it('marks valid overflow rows invalid when the list would exceed 500 links', () => {
    const preview = parseCollectionImport('a.example\nb.example', {
      currentLinkCount: 499,
    });
    expect(preview.valid.map((row) => row.url)).toEqual(['https://a.example/']);
    expect(preview.invalid).toEqual([
      expect.objectContaining({
        sourceRow: 2,
        reason: 'Import would exceed the 500-link limit.',
      }),
    ]);
  });

  it('rejects oversized, replacement-character, excessive-row, and malformed CSV input', () => {
    expect(() => parseCollectionImport('x'.repeat(MAX_IMPORT_BYTES + 1))).toThrow(CollectionImportError);
    expect(() => parseCollectionImport('https://example.com/\uFFFD')).toThrow(/valid UTF-8/);
    expect(() => parseCollectionImport(Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `https://e${i}.com`).join('\n'))).toThrow(/more than 1000 rows/);
    expect(() => parseCollectionImport('url,title\nexample.com,"unterminated', { format: 'csv' })).toThrow(/unterminated/);
  });
});

describe('collection export serialization', () => {
  it('escapes CSV cells for spreadsheets and preserves deterministic order', () => {
    const csv = serializeCollectionCsv(list);
    expect(csv.split('\r\n').slice(0, 3)).toEqual([
      'url,title,description,folder,pinned',
      "https://first.example.com/,\"'=SUM(1,1)\",'+formula,Research,true",
      'https://second.example.com/,<Second>,Description,,false',
    ]);
  });

  it('quotes CSV fields containing delimiters', () => {
    expect(escapeCsvCell('hello, "world"')).toBe('"hello, ""world"""');
  });

  it('exports JSON without ownership, IDs, analytics, or timestamps while preserving metadata', () => {
    const parsed = JSON.parse(serializeCollectionJson(list));
    expect(parsed.version).toBe(1);
    expect(parsed.list).toMatchObject({
      slug: 'my/list',
      description: 'Useful links',
    });
    expect(parsed.list.links[0]).toMatchObject({
      url: 'https://first.example.com/',
      title: '=SUM(1,1)',
      folder: 'Research',
      pinned: true,
      position: 0,
    });
    expect(JSON.stringify(parsed)).not.toContain('owner-1');
    expect(JSON.stringify(parsed)).not.toContain('old-1');
  });

  it('exports standards-compatible Netscape HTML with escaped titles and folder groups', () => {
    const html = serializeCollectionHtml(list);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
    expect(html).toContain('<DT><H3>Research</H3>');
    expect(html).toContain('<DT><A HREF="https://first.example.com/">=SUM(1,1)</A>');
    expect(html).toContain('<DT><A HREF="https://second.example.com/">&lt;Second&gt;</A>');
  });
});
