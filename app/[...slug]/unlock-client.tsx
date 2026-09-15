'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/nav-header';

interface ProtectedListUnlockProps {
  slug: string;
}

export function ProtectedListUnlock({ slug }: ProtectedListUnlockProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setUnlocking(true);

    try {
      const res = await fetch('/api/lists/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug, password }),
      });
      if (!res.ok) {
        const retryAfter = res.headers.get('Retry-After');
        setError(retryAfter ? 'Too many attempts. Try again later.' : 'Unable to unlock this list.');
        return;
      }
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div>
      <NavHeader />
      <main className="page">
        <section className="unlock-card" aria-labelledby="unlock-title">
          <div className="lock-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 id="unlock-title">Password required</h1>
          <p className="muted">Enter the password to view this list.</p>

          <form onSubmit={handleSubmit} className="unlock-form">
            <label htmlFor="list-password" className="label">Password</label>
            <input
              id="list-password"
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p className="validation-message">{error}</p>}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!password || unlocking}
              style={!password || unlocking ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              {unlocking ? 'Unlocking…' : 'Unlock list'}
            </button>
          </form>
        </section>
      </main>

      <style jsx>{`
        .page {
          max-width: 520px;
          margin: 0 auto;
          padding: 48px 16px;
        }
        .unlock-card {
          background: var(--surface);
          border: 1px solid var(--surface-border);
          border-radius: var(--radius);
          padding: 28px;
          text-align: center;
        }
        .lock-icon {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          background: var(--blue-bg);
          color: var(--accent);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
        }
        h1 {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 6px;
        }
        .unlock-form {
          display: grid;
          gap: 10px;
          text-align: left;
          margin-top: 22px;
        }
        .unlock-form .btn {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
