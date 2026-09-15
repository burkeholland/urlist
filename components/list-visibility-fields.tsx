'use client';

import type { ListVisibility } from '@/lib/types';

interface ListVisibilityFieldsProps {
  visibility: ListVisibility;
  onVisibilityChange: (visibility: ListVisibility) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  passwordPlaceholder?: string;
  passwordHelp?: string;
}

const OPTIONS: Array<{ value: ListVisibility; title: string; detail: string }> = [
  { value: 'public', title: 'Public', detail: 'Anyone with the link can view. Search engines may index it.' },
  { value: 'unlisted', title: 'Unlisted', detail: 'Anyone with the link can view, but the page asks search engines not to index it.' },
  { value: 'password-protected', title: 'Password', detail: 'Visitors must enter a password before any list details are shown.' },
];

export function ListVisibilityFields({
  visibility,
  onVisibilityChange,
  password,
  onPasswordChange,
  passwordPlaceholder = 'At least 8 characters',
  passwordHelp = 'Passwords are hashed before storage and are never shown again.',
}: ListVisibilityFieldsProps) {
  return (
    <fieldset className="visibility-fieldset">
      <legend className="label">Visibility</legend>
      <div className="visibility-options">
        {OPTIONS.map((option) => (
          <label key={option.value} className={`visibility-option${visibility === option.value ? ' selected' : ''}`}>
            <input
              type="radio"
              name="visibility"
              value={option.value}
              checked={visibility === option.value}
              onChange={() => onVisibilityChange(option.value)}
            />
            <span>
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </span>
          </label>
        ))}
      </div>

      {visibility === 'password-protected' && (
        <div className="password-field">
          <label htmlFor="list-password" className="label">List password</label>
          <input
            id="list-password"
            className="input"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={passwordPlaceholder}
            autoComplete="new-password"
          />
          <p className="small muted">{passwordHelp}</p>
        </div>
      )}

      <style jsx>{`
        .visibility-fieldset {
          border: 0;
          padding: 0;
          margin: 0 0 14px;
        }
        .visibility-options {
          display: grid;
          gap: 8px;
        }
        .visibility-option {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg-secondary);
          padding: 10px;
          cursor: pointer;
        }
        .visibility-option.selected {
          border-color: var(--accent);
          background: var(--blue-bg);
        }
        .visibility-option input {
          margin-top: 3px;
          accent-color: var(--accent);
        }
        .visibility-option strong {
          display: block;
          font-size: 14px;
          color: var(--text);
        }
        .visibility-option small {
          display: block;
          color: var(--text-muted);
          line-height: 1.35;
          margin-top: 2px;
        }
        .password-field {
          margin-top: 10px;
        }
        .password-field p {
          margin: 6px 0 0;
        }
      `}</style>
    </fieldset>
  );
}
