'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/nav-header';
import { useAuth } from '@/hooks/use-auth';

const PENDING_INVITE_TOKEN_KEY = 'urlist-pending-invite-token';

export default function AcceptInvitePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'accepted' | 'error'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('Loading invite…');

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const tokenFromHash = params.get('token');
      const storedToken = sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY);
      const nextToken = tokenFromHash || storedToken;

      if (tokenFromHash) {
        sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, tokenFromHash);
        history.replaceState(null, '', window.location.pathname);
      }

      if (!nextToken) {
        setMessage('Invite link is missing a token.');
        setStatus('error');
        return;
      }

      setToken(nextToken);
      setStatus('ready');
      setMessage('Ready to accept this invite.');
    });
  }, []);

  useEffect(() => {
    if (authLoading || !token || !user) return;

    async function accept() {
      setStatus('accepting');
      setMessage('Accepting invite…');
      try {
        const res = await fetch('/api/invites/accept', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await res.json();
        if (!res.ok) {
          setMessage(body.error?.message || 'Failed to accept invite.');
          setStatus('error');
          return;
        }
        sessionStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
        setStatus('accepted');
        setMessage(`Invite accepted as ${body.role}. Redirecting…`);
        router.replace(`/app/compose/${body.listId}`);
      } catch {
        setMessage('Failed to accept invite.');
        setStatus('error');
      }
    }

    void accept();
  }, [authLoading, router, token, user]);

  function signIn() {
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent('/app/invites/accept')}`;
  }

  const needsSignIn = !authLoading && !user && token && status !== 'error';

  return (
    <div>
      <NavHeader />
      <main className="page">
        <section className="card">
          <h1>Accept invite</h1>
          <p className="muted">{needsSignIn ? 'Sign in with GitHub to accept this collaborator invite.' : message}</p>
          {needsSignIn && (
            <button className="btn btn-primary" onClick={signIn}>
              Sign in to accept
            </button>
          )}
          {status === 'error' && (
            <button className="btn btn-outline" onClick={() => router.push('/app/my-links')}>
              Go to My lists
            </button>
          )}
        </section>
      </main>
      <style jsx>{`
        .page {
          max-width: 560px;
          margin: 0 auto;
          padding: 56px 16px;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--surface-border);
          border-radius: var(--radius);
          padding: 24px;
        }
        h1 {
          font-size: 22px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        p {
          margin-bottom: 16px;
        }
      `}</style>
    </div>
  );
}
