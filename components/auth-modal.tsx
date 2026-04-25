'use client';

import { useAuth } from '@/hooks/use-auth';

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { signIn } = useAuth();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm p-8 shadow-2xl"
        style={{ background: 'var(--surface)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '12px', border: '1px solid var(--surface-border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="mb-1"
          style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}
        >
          Sign in to The Urlist
        </h2>
        <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Sign in with GitHub to save and manage your lists.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => signIn()}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
            style={{
              border: '1px solid var(--surface-border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-sm"
          style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
