import { normalizeUrl } from './url';
import {
  MAX_FOLDER_LENGTH,
  MAX_LINKS,
  MAX_OG_DESCRIPTION_LENGTH,
  MAX_OG_TITLE_LENGTH,
} from './schemas/shared';
import type { LinkWithId, ListWithLinks } from './types';

export const IMPORT_FORMATS = ['text', 'csv', 'html'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];
export type ExportFormat = 'json' | 'csv' | 'html';

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

const FORMULA_PREFIX_REGEX = /^[\s]*[=+\-@\t\r]/;

export class CollectionImportError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CollectionImportError';
    this.code = code;
  }
}

export interface ImportLinkCandidate {
  sourceRow: number;
  raw: string;
  url: string;
  title: string | null;
  description: string | null;
  folder: string | null;
  pinned: boolean;
}

export interface ImportInvalidRow {
  sourceRow: number;
  raw: string;
  reason: string;
}

export interface ImportDuplicateRow {
  sourceRow: number;
  raw: string;
  url: string;
  reason: 'duplicate_in_file' | 'already_in_list';
  duplicateOf?: number;
}

export interface ImportPreviewResult {
  format: ImportFormat;
  valid: ImportLinkCandidate[];
  invalid: ImportInvalidRow[];
  duplicates: ImportDuplicateRow[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
    availableSlots: number;
    maxLinks: number;
  };
}

interface RawImportRow {
  sourceRow: number;
  raw: string;
  url: string;
  title?: string | null;
  description?: string | null;
  folder?: string | null;
  pinned?: boolean;
}

interface CsvRecord {
  sourceRow: number;
  line: string;
}

interface ParseOptions {
  format?: ImportFormat | 'auto';
  existingUrls?: string[];
  currentLinkCount?: number;
}

function assertBoundedContent(content: string): void {
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > MAX_IMPORT_BYTES) {
    throw new CollectionImportError(
      'IMPORT_TOO_LARGE',
      `Import file exceeds the ${MAX_IMPORT_BYTES} byte limit.`,
    );
  }
  if (content.includes('\uFFFD')) {
    throw new CollectionImportError(
      'INVALID_ENCODING',
      'Import must be valid UTF-8 text.',
    );
  }
}

function detectImportFormat(content: string, requested?: ImportFormat | 'auto'): ImportFormat {
  if (requested && requested !== 'auto') return requested;
  const trimmed = content.trimStart();
  if (/^<!doctype\s+NETSCAPE-Bookmark-file-1/i.test(trimmed) || /<A\s+[^>]*HREF=/i.test(trimmed)) {
    return 'html';
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  if (/,/.test(firstLine) && /\burl\b/i.test(firstLine)) return 'csv';
  return 'text';
}

function normalizeExistingUrls(existingUrls: string[] | undefined): Set<string> {
  const normalized = new Set<string>();
  for (const url of existingUrls ?? []) {
    const result = normalizeUrl(url);
    if (result.valid) normalized.add(result.url);
  }
  return normalized;
}

function cleanImportedText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== 'string' || !value) return null;
  const cleaned = decodeHtml(value.replace(/<[^>]*>/g, ''))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
  if (!cleaned) return null;
  return FORMULA_PREFIX_REGEX.test(cleaned) ? `'${cleaned}` : cleaned;
}

function parseBoolean(value: string | null | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'y', 'pinned'].includes(value.trim().toLowerCase());
}

function decodeHtml(value: string): string {
  const decodeNumericEntity = (match: string, code: number) => {
    if (
      !Number.isInteger(code) ||
      code < 0 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      return match;
    }
    return String.fromCodePoint(code);
  };

  return value
    .replace(/&#(\d+);/g, (match, code) => decodeNumericEntity(match, Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => decodeNumericEntity(match, Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function parseTextRows(content: string): RawImportRow[] {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ sourceRow: index + 1, raw: line, url: line.trim() }))
    .filter((row) => row.url.length > 0);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else if (char === '"' && current.length === 0) {
      quoted = true;
    } else {
      current += char;
    }
  }

  if (quoted) {
    throw new CollectionImportError('MALFORMED_CSV', 'CSV contains an unterminated quoted field.');
  }

  cells.push(current);
  return cells;
}

function parseCsvRecords(content: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let current = '';
  let quoted = false;
  let atFieldStart = true;
  let sourceRow = 1;
  let row = 1;

  const pushRecord = () => {
    if (current.trim().length > 0) {
      records.push({ sourceRow, line: current });
    }
    current = '';
    sourceRow = row + 1;
    atFieldStart = true;
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const isCrLf = char === '\r' && content[i + 1] === '\n';
    const isNewline = char === '\n' || char === '\r';

    if (isNewline) {
      if (quoted) {
        current += '\n';
      } else {
        pushRecord();
      }
      if (isCrLf) i++;
      row++;
      continue;
    }

    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        current += char;
        current += content[i + 1];
        i++;
        atFieldStart = false;
        continue;
      }
      if (char === '"') {
        quoted = false;
      }
      current += char;
      atFieldStart = false;
      continue;
    }

    if (char === ',') {
      current += char;
      atFieldStart = true;
      continue;
    }

    if (char === '"' && atFieldStart) {
      quoted = true;
    }
    current += char;
    atFieldStart = false;
  }

  if (quoted) {
    throw new CollectionImportError('MALFORMED_CSV', 'CSV contains an unterminated quoted field.');
  }

  pushRecord();
  return records;
}

function parseCsvRows(content: string): RawImportRow[] {
  const lines = parseCsvRecords(content);
  if (lines.length === 0) return [];

  const firstCells = parseCsvLine(lines[0].line).map((cell) => cell.trim().toLowerCase());
  const headerIndex = firstCells.indexOf('url');
  const hasHeader = headerIndex >= 0;
  const headers = hasHeader ? firstCells : ['url', 'title', 'description', 'folder', 'pinned'];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map(({ line, sourceRow }) => {
    const cells = parseCsvLine(line);
    const get = (name: string) => {
      const index = headers.indexOf(name);
      return index >= 0 ? cells[index]?.trim() ?? '' : '';
    };
    return {
      sourceRow,
      raw: line,
      url: get('url'),
      title: get('title') || get('ogtitle'),
      description: get('description') || get('ogdescription'),
      folder: get('folder'),
      pinned: parseBoolean(get('pinned')),
    };
  });
}

function parseHtmlRows(content: string): RawImportRow[] {
  const rows: RawImportRow[] = [];
  const folderStack: string[] = [];
  let pendingFolder: string | null = null;
  let lastLink: RawImportRow | null = null;

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const folderMatch = line.match(/<H3\b[^>]*>([\s\S]*?)<\/H3>/i);
    if (folderMatch) {
      pendingFolder = cleanImportedText(stripHtml(folderMatch[1]), MAX_FOLDER_LENGTH);
    }

    if (/<DL\b/i.test(line) && pendingFolder) {
      folderStack.push(pendingFolder);
      pendingFolder = null;
    }

    const linkMatch = line.match(/<A\b([^>]*)>([\s\S]*?)<\/A>/i);
    if (linkMatch) {
      const hrefMatch = linkMatch[1].match(/\bHREF=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = decodeHtml(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '');
      const title = stripHtml(linkMatch[2]);
      const row = {
        sourceRow: index + 1,
        raw: line,
        url: href,
        title,
        folder: folderStack.length > 0 ? folderStack.join('/') : null,
        pinned: false,
      };
      rows.push(row);
      lastLink = row;
    }

    const descriptionMatch = line.match(/<DD\b[^>]*>([\s\S]*)/i);
    if (descriptionMatch && lastLink) {
      lastLink.description = stripHtml(descriptionMatch[1]);
    }

    if (/<\/DL>/i.test(line) && folderStack.length > 0) {
      folderStack.pop();
    }
  }

  return rows;
}

function parseRows(content: string, format: ImportFormat): RawImportRow[] {
  if (format === 'text') return parseTextRows(content);
  if (format === 'csv') return parseCsvRows(content);
  return parseHtmlRows(content);
}

export function parseCollectionImport(content: string, options: ParseOptions = {}): ImportPreviewResult {
  assertBoundedContent(content);
  const format = detectImportFormat(content, options.format);
  const rows = parseRows(content, format);
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new CollectionImportError(
      'TOO_MANY_ROWS',
      `Import contains more than ${MAX_IMPORT_ROWS} rows.`,
    );
  }

  const existing = normalizeExistingUrls(options.existingUrls);
  const currentLinkCount = options.currentLinkCount ?? existing.size;
  const availableSlots = Math.max(0, MAX_LINKS - currentLinkCount);
  const seen = new Map<string, number>();
  const valid: ImportLinkCandidate[] = [];
  const invalid: ImportInvalidRow[] = [];
  const duplicates: ImportDuplicateRow[] = [];

  for (const row of rows) {
    const normalized = normalizeUrl(row.url);
    if (!normalized.valid) {
      invalid.push({
        sourceRow: row.sourceRow,
        raw: row.raw,
        reason: normalized.error ?? 'Invalid URL.',
      });
      continue;
    }

    if (existing.has(normalized.url)) {
      duplicates.push({
        sourceRow: row.sourceRow,
        raw: row.raw,
        url: normalized.url,
        reason: 'already_in_list',
      });
      continue;
    }

    const duplicateOf = seen.get(normalized.url);
    if (duplicateOf !== undefined) {
      duplicates.push({
        sourceRow: row.sourceRow,
        raw: row.raw,
        url: normalized.url,
        reason: 'duplicate_in_file',
        duplicateOf,
      });
      continue;
    }

    seen.set(normalized.url, row.sourceRow);
    if (valid.length >= availableSlots) {
      invalid.push({
        sourceRow: row.sourceRow,
        raw: row.raw,
        reason: `Import would exceed the ${MAX_LINKS}-link limit.`,
      });
      continue;
    }

    valid.push({
      sourceRow: row.sourceRow,
      raw: row.raw,
      url: normalized.url,
      title: cleanImportedText(row.title, MAX_OG_TITLE_LENGTH),
      description: cleanImportedText(row.description, MAX_OG_DESCRIPTION_LENGTH),
      folder: cleanImportedText(row.folder, MAX_FOLDER_LENGTH),
      pinned: row.pinned ?? false,
    });
  }

  return {
    format,
    valid,
    invalid,
    duplicates,
    summary: {
      totalRows: rows.length,
      validRows: valid.length,
      invalidRows: invalid.length,
      duplicateRows: duplicates.length,
      availableSlots,
      maxLinks: MAX_LINKS,
    },
  };
}

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const formulaSafe = FORMULA_PREFIX_REGEX.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(formulaSafe) ? `"${formulaSafe.replace(/"/g, '""')}"` : formulaSafe;
}

function exportLinkTitle(link: LinkWithId): string | null {
  return link.ogTitle;
}

function exportLinkDescription(link: LinkWithId): string | null {
  return link.ogDescription;
}

export function serializeCollectionCsv(list: ListWithLinks): string {
  const lines = [
    ['url', 'title', 'description', 'folder', 'pinned'].map(escapeCsvCell).join(','),
  ];

  for (const link of [...list.links].sort((a, b) => a.position - b.position)) {
    lines.push([
      link.url,
      exportLinkTitle(link),
      exportLinkDescription(link),
      link.folder ?? null,
      link.pinned ? 'true' : 'false',
    ].map(escapeCsvCell).join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appendBookmark(lines: string[], link: LinkWithId, indent: string): void {
  const title = exportLinkTitle(link) || link.url;
  lines.push(`${indent}<DT><A HREF="${escapeHtml(link.url)}">${escapeHtml(title)}</A>`);
  const description = exportLinkDescription(link);
  if (description) lines.push(`${indent}<DD>${escapeHtml(description)}`);
}

export function serializeCollectionHtml(list: ListWithLinks): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    `<TITLE>${escapeHtml(list.slug)} - Urlist</TITLE>`,
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const links = [...list.links].sort((a, b) => a.position - b.position);
  let openFolder: string | null = null;

  for (const link of links) {
    const folder = link.folder?.trim();
    if (!folder) {
      if (openFolder) {
        lines.push('    </DL><p>');
        openFolder = null;
      }
      appendBookmark(lines, link, '    ');
      continue;
    }

    if (openFolder !== folder) {
      if (openFolder) lines.push('    </DL><p>');
      lines.push(`    <DT><H3>${escapeHtml(folder)}</H3>`);
      lines.push('    <DL><p>');
      openFolder = folder;
    }
    appendBookmark(lines, link, '        ');
  }

  if (openFolder) {
    lines.push('    </DL><p>');
  }

  lines.push('</DL><p>');
  return `${lines.join('\n')}\n`;
}

export function serializeCollectionJson(list: ListWithLinks): string {
  return `${JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    list: {
      slug: list.slug,
      description: list.description,
      links: [...list.links].sort((a, b) => a.position - b.position).map((link) => ({
        url: link.url,
        title: exportLinkTitle(link),
        description: exportLinkDescription(link),
        image: link.ogImage,
        siteName: link.ogSiteName,
        folder: link.folder ?? null,
        pinned: link.pinned ?? false,
        position: link.position,
      })),
    },
  }, null, 2)}\n`;
}

export function serializeCollection(list: ListWithLinks, format: ExportFormat): string {
  if (format === 'json') return serializeCollectionJson(list);
  if (format === 'csv') return serializeCollectionCsv(list);
  return serializeCollectionHtml(list);
}

export function exportContentType(format: ExportFormat): string {
  if (format === 'json') return 'application/json; charset=utf-8';
  if (format === 'csv') return 'text/csv; charset=utf-8';
  return 'text/html; charset=utf-8';
}
