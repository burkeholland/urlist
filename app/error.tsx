'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700 }}>Something went wrong</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        className="btn btn-primary"
      >
        Try again
      </button>
    </div>
  );
}
