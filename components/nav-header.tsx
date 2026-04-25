'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AuthModal } from './auth-modal';
import { ThemeToggle } from './theme-toggle';

function UserMenu({ user, onSignOut }: { user: { username: string; name: string; avatar: string }; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'color 0.15s',
        }}
      >
        <img
          src={user.avatar}
          alt={user.username}
          style={{ width: 22, height: 22, borderRadius: '50%' }}
        />
        <span style={{ fontSize: 14, fontFamily: 'var(--font-body)' }}>{user.username}</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            minWidth: 120,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            padding: '4px 0',
            zIndex: 50,
          }}
        >
          <button
            onClick={() => { onSignOut(); setOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 12px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--blue-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2M10.5 11.5L14 8l-3.5-3.5M14 8H6" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function NavHeader() {
  const { user, loading, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <header className="w-full border-b border-[var(--surface-border)]" style={{ background: 'var(--surface)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <nav className="mx-auto flex h-12 w-full max-w-[860px] items-center justify-between px-4">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="text-base font-bold text-[var(--text)] no-underline"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px' }}
            >
              urlist<span className="text-[var(--accent)]">.</span>
            </Link>
            <div className="flex items-center gap-[14px]">
              <Link href="/" className="text-[15px] font-medium text-[var(--text)] hover:text-[var(--text)]">
                Home
              </Link>
              <Link
                href="/app/compose"
                className="text-[15px] text-[var(--text-muted)] no-underline transition-colors duration-150 hover:text-[var(--text)]"
              >
                Compose
              </Link>
              {user && (
                <Link
                  href="/app/my-links"
                  className="text-[15px] text-[var(--text-muted)] no-underline transition-colors duration-150 hover:text-[var(--text)]"
                >
                  My lists
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {loading ? (
              <span className="text-[15px] text-[var(--text-muted)]">...</span>
            ) : user ? (
              <UserMenu user={user} onSignOut={signOut} />
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-[15px] text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text)]"
              >
                Sign in
              </button>
            )}
          </div>
        </nav>
      </header>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
}
