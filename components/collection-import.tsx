'use client';

import { useRef, useState } from 'react';
import {
  IMPORT_FORMATS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  type ImportFormat,
  type ImportPreviewResult,
} from '@/lib/collection-io';
import { MAX_LINKS } from '@/lib/schemas/shared';
import type { DraftLink } from '@/lib/types';

export type ImportableDraftLink = Pick<
  DraftLink,
  'url' | 'pinned' | 'folder' | 'ogTitle' | 'ogDescription' | 'ogImage' | 'ogSiteName'
>;

interface CollectionImportProps {
  currentLinks: DraftLink[];
  onImport: (links: ImportableDraftLink[]) => void;
}

function duplicateReason(reason: string): string {
  return reason === 'already_in_list' ? 'Already in this list' : 'Duplicate in import';
}

export function CollectionImport({ currentLinks, onImport }: CollectionImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<ImportFormat | 'auto'>('auto');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedMessage, setImportedMessage] = useState<string | null>(null);

  const remainingSlots = Math.max(0, MAX_LINKS - currentLinks.length);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreview(null);
    setImportedMessage(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`File exceeds the ${MAX_IMPORT_BYTES} byte import limit.`);
      return;
    }
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      setContent(decoded);
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'csv') setFormat('csv');
      if (extension === 'html' || extension === 'htm') setFormat('html');
      if (extension === 'txt') setFormat('text');
    } catch {
      setError('Import file must be valid UTF-8 text.');
    }
  };

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    setImportedMessage(null);
    try {
      const res = await fetch('/api/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          format,
          existingUrls: currentLinks.map((link) => link.url),
          currentLinkCount: currentLinks.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreview(null);
        setError(data.error?.message || 'Could not preview this import.');
        return;
      }
      setPreview(data);
    } catch {
      setPreview(null);
      setError('Could not preview this import.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview || preview.valid.length === 0) return;
    onImport(preview.valid.map((link) => ({
      url: link.url,
      pinned: link.pinned,
      folder: link.folder,
      ogTitle: link.title,
      ogDescription: link.description,
      ogImage: null,
      ogSiteName: null,
    })));
    setImportedMessage(`Added ${preview.valid.length} link${preview.valid.length === 1 ? '' : 's'} from import preview.`);
    setPreview(null);
    setContent('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="import-panel" aria-label="Import links">
      <div className="import-head">
        <div>
          <h3>Import links</h3>
          <p className="small muted">
            Plain text URLs, CSV, or Netscape bookmark HTML. {remainingSlots} slots available.
          </p>
        </div>
        <select
          value={format}
          onChange={(event) => setFormat(event.target.value as ImportFormat | 'auto')}
          className="input input-sm import-format"
          aria-label="Import format"
        >
          <option value="auto">Auto-detect</option>
          {IMPORT_FORMATS.map((candidate) => (
            <option key={candidate} value={candidate}>{candidate.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="import-controls">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.html,.htm,text/plain,text/csv,text/html"
          onChange={(event) => void handleFile(event.target.files?.[0])}
          className="input input-sm"
        />
        <button
          type="button"
          className="btn btn-outline"
          onClick={handlePreview}
          disabled={!content.trim() || loading || remainingSlots === 0}
        >
          {loading ? 'Previewing…' : 'Preview import'}
        </button>
      </div>

      <textarea
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setPreview(null);
          setImportedMessage(null);
        }}
        className="input import-textarea"
        placeholder="Paste one URL per line, CSV with url/title/description/folder columns, or Netscape bookmark HTML."
      />
      <p className="xsmall muted">
        Limits: {MAX_LINKS} links per list, {MAX_IMPORT_ROWS} import rows, {MAX_IMPORT_BYTES} bytes, UTF-8 only.
      </p>

      {error && <p className="validation-message">{error}</p>}
      {importedMessage && <p className="import-success">{importedMessage}</p>}

      {preview && (
        <div className="import-preview">
          <div className="preview-summary">
            <span>{preview.summary.validRows} valid</span>
            <span>{preview.summary.invalidRows} invalid</span>
            <span>{preview.summary.duplicateRows} duplicate</span>
            <span>{preview.format.toUpperCase()}</span>
          </div>

          {preview.valid.length > 0 && (
            <div className="preview-block">
              <strong>Valid rows</strong>
              <ul>
                {preview.valid.slice(0, 5).map((row) => (
                  <li key={`valid-${row.sourceRow}`}>
                    Row {row.sourceRow}: {row.title ? `${row.title} — ` : ''}{row.url}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(preview.invalid.length > 0 || preview.duplicates.length > 0) && (
            <div className="preview-block">
              <strong>Skipped rows</strong>
              <ul>
                {preview.invalid.slice(0, 4).map((row) => (
                  <li key={`invalid-${row.sourceRow}`}>Row {row.sourceRow}: {row.reason}</li>
                ))}
                {preview.duplicates.slice(0, 4).map((row) => (
                  <li key={`duplicate-${row.sourceRow}`}>Row {row.sourceRow}: {duplicateReason(row.reason)}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={preview.valid.length === 0}
          >
            Add {preview.valid.length} valid link{preview.valid.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      <style jsx>{`
        .import-panel {
          border: 1px solid var(--surface-border);
          background: var(--surface);
          border-radius: var(--radius);
          padding: 14px;
          margin-bottom: 18px;
        }
        .import-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .import-head h3 {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 2px;
        }
        .import-head p {
          margin: 0;
        }
        .import-format {
          width: 140px;
          flex-shrink: 0;
        }
        .import-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .import-textarea {
          min-height: 92px;
          resize: vertical;
          font-family: var(--font-mono);
          font-size: 0.875rem;
        }
        .import-success {
          color: var(--success);
          font-size: 0.875rem;
          margin: 6px 0 0;
        }
        .import-preview {
          margin-top: 10px;
          display: grid;
          gap: 10px;
        }
        .preview-summary {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .preview-summary span {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-muted);
          background: var(--bg-secondary);
          border-radius: 999px;
          padding: 3px 8px;
        }
        .preview-block {
          font-size: 0.875rem;
          color: var(--text-muted);
        }
        .preview-block strong {
          color: var(--text);
        }
        .preview-block ul {
          margin: 4px 0 0;
          padding-left: 18px;
        }
        .preview-block li {
          word-break: break-word;
        }
        @media (max-width: 580px) {
          .import-head,
          .import-controls {
            flex-direction: column;
          }
          .import-format {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
