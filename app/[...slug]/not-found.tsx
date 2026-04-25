import Link from 'next/link';
import { NavHeader } from '@/components/nav-header';

export default function ListNotFound() {
  return (
    <>
      <NavHeader />
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>List not found</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
          This list doesn&apos;t exist or may have been deleted.
        </p>
        <Link href="/app/compose" className="btn btn-primary">
          Create a list
        </Link>
      </main>
    </>
  );
}
