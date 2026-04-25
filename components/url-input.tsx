'use client';

import { useState, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = normalizeUrl(value);
    if (!result.valid) {
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
      ? undefined
      : {
          display: 'flex',
          gap: '10px',
        };

  return (
    <form onSubmit={handleSubmit}>
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
          className="input input-mono"
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="btn btn-primary"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </div>
      {error && (
        <p
          style={{
            color: 'var(--danger)',
            fontSize: '14px',
            marginTop: '4px',
          }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
