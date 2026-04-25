'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { validateSlugFormat } from '@/lib/slug';
import type { SlugValidationStatus } from '@/lib/types';

interface SlugInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

type ApiState = { type: 'idle' } | { type: 'result'; available: boolean; slug: string } | { type: 'error' };

export function SlugInput({ value, onChange, disabled }: SlugInputProps) {
  const [apiState, setApiState] = useState<ApiState>({ type: 'idle' });
  const debouncedSlug = useDebounce(value, 400);

  const formatCheck = useMemo(() => {
    if (!value) return { valid: true } as { valid: boolean; error?: string };
    return validateSlugFormat(value);
  }, [value]);

  const status: SlugValidationStatus = useMemo(() => {
    if (!value) return 'idle';
    if (!formatCheck.valid) return 'invalid';
    if (debouncedSlug !== value) return 'checking';
    if (apiState.type === 'result' && apiState.slug === debouncedSlug) {
      return apiState.available ? 'valid' : 'taken';
    }
    if (apiState.type === 'error') return 'idle';
    return 'checking';
  }, [value, debouncedSlug, formatCheck.valid, apiState]);

  const error = useMemo(() => {
    if (!value) return null;
    if (!formatCheck.valid) return formatCheck.error || 'Invalid slug format.';
    if (status === 'taken') return 'This vanity URL is already taken.';
    if (apiState.type === 'error') return 'Could not check availability.';
    return null;
  }, [value, formatCheck, status, apiState]);

  // Only fire API calls in the effect — setState only in async callbacks
  useEffect(() => {
    if (!debouncedSlug) return;
    const check = validateSlugFormat(debouncedSlug);
    if (!check.valid) return;

    const controller = new AbortController();
    fetch(`/api/slugs/${encodeURIComponent(debouncedSlug)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { available?: boolean }) => {
        setApiState({ type: 'result', available: !!data.available, slug: debouncedSlug });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== 'AbortError') {
          setApiState({ type: 'error' });
        }
      });

    return () => controller.abort();
  }, [debouncedSlug]);

  const statusText = {
    idle: '',
    checking: 'checking...',
    valid: '✓ available',
    invalid: '',
    taken: '✗ taken',
  }[status];

  const statusClassName = ['url-status', status === 'valid' ? 'available' : '', status === 'taken' ? 'taken' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field-group">
      <label htmlFor="slug-input" className="label">
        URL
      </label>
      <div className="url-input-wrap">
        <span className="url-prefix">urlist.app/</span>
        <input
          id="slug-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder="my-awesome-links"
          disabled={disabled}
        />
      </div>
      <div className={statusClassName}>{statusText}</div>
      {error && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '14px',
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export { type SlugValidationStatus };
