import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700 }}>Page not found</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
        Go home
      </Link>
    </div>
  );
}
