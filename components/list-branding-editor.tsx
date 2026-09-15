'use client';

import {
  LIST_ACCENT_OPTIONS,
  LIST_LAYOUT_OPTIONS,
  LIST_THEME_OPTIONS,
  MAX_PUBLIC_TITLE_LENGTH,
  MAX_SOCIAL_DESCRIPTION_LENGTH,
  MAX_SOCIAL_TITLE_LENGTH,
} from '@/lib/list-branding';
import type { DraftBranding } from '@/lib/types';

interface ListBrandingEditorProps {
  branding: DraftBranding;
  onChange: (updates: Partial<DraftBranding>) => void;
}

function AppearanceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (nextValue: string) => void;
}) {
  const inputId = `branding-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="field-group">
      <label className="label" htmlFor={inputId}>
        {label}
      </label>
      <select
        id={inputId}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ListBrandingEditor({
  branding,
  onChange,
}: ListBrandingEditorProps) {
  return (
    <section
      aria-labelledby="appearance-heading"
      className="compose-meta-panel"
      style={{ marginBottom: 16 }}
    >
      <div className="field-group">
        <h2 id="appearance-heading" style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Appearance and sharing
        </h2>
        <p className="small muted" style={{ marginBottom: 16 }}>
          Pick from curated presets and validated image URLs. Image checks run on save.
        </p>
      </div>

      <div className="compose-meta-row">
        <AppearanceSelect
          label="Theme"
          value={branding.appearance.theme}
          options={LIST_THEME_OPTIONS}
          onChange={(theme) =>
            onChange({
              appearance: {
                ...branding.appearance,
                theme: theme as DraftBranding['appearance']['theme'],
              },
            })
          }
        />
        <AppearanceSelect
          label="Accent"
          value={branding.appearance.accent}
          options={LIST_ACCENT_OPTIONS}
          onChange={(accent) =>
            onChange({
              appearance: {
                ...branding.appearance,
                accent: accent as DraftBranding['appearance']['accent'],
              },
            })
          }
        />
        <AppearanceSelect
          label="Layout"
          value={branding.appearance.layout}
          options={LIST_LAYOUT_OPTIONS}
          onChange={(layout) =>
            onChange({
              appearance: {
                ...branding.appearance,
                layout: layout as DraftBranding['appearance']['layout'],
              },
            })
          }
        />
      </div>

      <div className="compose-meta-row">
        <div className="field-group">
          <label htmlFor="publicTitle" className="label">
            Public title
          </label>
          <input
            id="publicTitle"
            className="input"
            value={branding.publicTitle}
            maxLength={MAX_PUBLIC_TITLE_LENGTH}
            onChange={(event) => onChange({ publicTitle: event.target.value })}
            placeholder="Optional title shown above the list"
          />
          <p className="char-count">{branding.publicTitle.length}/{MAX_PUBLIC_TITLE_LENGTH}</p>
        </div>
        <div className="field-group">
          <label htmlFor="socialTitle" className="label">
            Social preview title
          </label>
          <input
            id="socialTitle"
            className="input"
            value={branding.socialTitle}
            maxLength={MAX_SOCIAL_TITLE_LENGTH}
            onChange={(event) => onChange({ socialTitle: event.target.value })}
            placeholder="Optional share-card title"
          />
          <p className="char-count">{branding.socialTitle.length}/{MAX_SOCIAL_TITLE_LENGTH}</p>
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="socialDescription" className="label">
          Social preview description
        </label>
        <textarea
          id="socialDescription"
          className="input"
          value={branding.socialDescription}
          maxLength={MAX_SOCIAL_DESCRIPTION_LENGTH}
          onChange={(event) => onChange({ socialDescription: event.target.value })}
          placeholder="Optional share-card description"
          style={{ minHeight: 96 }}
        />
        <p className="char-count">{branding.socialDescription.length}/{MAX_SOCIAL_DESCRIPTION_LENGTH}</p>
      </div>

      <div className="compose-meta-row">
        <div className="field-group">
          <label htmlFor="coverImageUrl" className="label">
            Cover image URL
          </label>
          <input
            id="coverImageUrl"
            className="input input-mono"
            value={branding.coverImageUrl}
            onChange={(event) => onChange({ coverImageUrl: event.target.value })}
            placeholder="https://example.com/cover.png"
          />
          <p className="xsmall muted">Used in the public page header when present.</p>
        </div>
        <div className="field-group">
          <label htmlFor="socialImageUrl" className="label">
            Social image URL
          </label>
          <input
            id="socialImageUrl"
            className="input input-mono"
            value={branding.socialImageUrl}
            onChange={(event) => onChange({ socialImageUrl: event.target.value })}
            placeholder="https://example.com/share.png"
          />
          <p className="xsmall muted">Falls back to the cover image, then a generated preview.</p>
        </div>
      </div>
    </section>
  );
}
