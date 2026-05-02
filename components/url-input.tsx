'use client';

import { useId, useState, useRef } from 'react';
import { normalizeUrl } from '@/lib/url';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  placeholder?: string;
  loading?: boolean;
  size?: 'default' | 'large';
}

export function UrlInput({ onSubmit, placeholder = 'Paste a URL...', loading = false, size = 'default' }: UrlInputProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakeVariant, setShakeVariant] = useState<'a' | 'b'>('a');
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = normalizeUrl(value);
    if (!result.valid) {
      setShakeVariant((variant) => (variant === 'a' ? 'b' : 'a'));
      setError(result.error || 'Invalid URL.');
      return;
    }

    onSubmit(result.url);
    setValue('');
    inputRef.current?.focus();
  };

  const rowClassName = size === 'large' ? 'add-row' : '';
  const rowStyle =
    size === 'large'
      ? { marginBottom: 0, paddingBottom: 0 }
      : {
          display: 'flex',
          gap: '10px',
        };
  const reserveMessageSpace = size === 'large';

  return (
    <form onSubmit={handleSubmit} style={size === 'large' ? { paddingBottom: '24px' } : undefined}>
      <div className={rowClassName} style={rowStyle}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          disabled={loading}
          className={['input input-mono', error ? 'input-invalid' : '', error ? `validation-shake-${shakeVariant}` : '']
            .filter(Boolean)
            .join(' ')}
          style={{ flex: 1 }}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="btn btn-primary"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </div>
      {(error || reserveMessageSpace) && (
        <p
          id={error ? errorId : undefined}
          className="validation-message"
          aria-hidden={!error}
        >
          {error || '\u00A0'}
        </p>
      )}
    </form>
  );
}
