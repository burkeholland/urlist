'use client';

import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/nav-header';

export default function HomePage() {
  const router = useRouter();

  const handleUrlSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const url = formData.get('url') as string;
    if (url?.trim()) {
      router.push(`/app/compose?url=${encodeURIComponent(url.trim())}`);
    }
  };

  return (
    <>
      <style jsx>{`
        #page-home {
          min-height: 100svh;
          display: flex;
          flex-direction: column;
        }
        /* Hero section */
        .home-hero {
          padding: 64px 16px 84px;
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 48px;
        }
        .home-hero-text {
          flex: 1;
          min-width: 0;
        }
        .home-hero h1 {
          font-size: 34px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 12px;
          letter-spacing: -0.02em;
        }
        .home-hero h1 .w-coral {
          color: #ff7f50;
        }
        .home-hero h1 .w-azure {
          color: #0ea5e9;
        }
        .home-hero h1 .w-sage {
          color: #84cc16;
        }
        .home-hero p {
          font-size: 17px;
          color: var(--text-muted);
          max-width: 360px;
        }

        /* Mobile responsive */
        @media (max-width: 680px) {
          .home-hero {
            flex-direction: column;
            text-align: center;
            gap: 28px;
            padding: 40px 16px 44px;
          }
          .home-hero p {
            margin: 0 auto;
          }
          .home-preview {
            max-width: 100%;
          }
          .home-cta-section {
            padding-top: 24px;
          }
        }

        /* Preview card */
        .home-preview {
          width: 340px;
          flex-shrink: 0;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          overflow: hidden;
          text-align: left;
        }
        .home-preview-header {
          padding: 12px 14px;
          border-bottom: 1px solid var(--border);
        }
        .home-preview-slug {
          font-family: var(--font-mono);
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
        }
        .home-preview-meta {
          font-size: 13px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .home-preview-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
        }
        .home-preview-item:last-child {
          border-bottom: none;
        }
        .home-preview-thumb {
          width: 32px;
          height: 32px;
          border-radius: 4px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }
        .home-preview-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--text);
          line-height: 1.3;
        }
        .home-preview-url {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--text-muted);
        }

        /* CTA section with curved top */
        .home-cta-section {
          position: relative;
          padding: 32px 16px 0;
          text-align: center;
          background: var(--bg-secondary);
          flex: 1 1 auto;
          min-height: 0;
        }
        .home-cta-section::before {
          content: '';
          position: absolute;
          top: -40px;
          left: 0;
          width: 100%;
          height: 40px;
          background: var(--bg-secondary);
          border-radius: 50% 50% 0 0;
        }
        .home-cta-content {
          position: relative;
          z-index: 1;
          max-width: 860px;
          margin: 0 auto;
          padding: 0 16px;
        }
        .home-cta-content .label {
          margin-bottom: 10px;
          font-size: 16px;
        }
        .home-cta-input-row {
          display: flex;
          gap: 10px;
        }
        .home-cta-input-row .input {
          flex: 1;
          height: 56px;
          font-size: 19px;
          padding: 0 18px;
          border-radius: 8px;
        }
        .home-cta-input-row .btn {
          height: 56px;
          padding: 0 28px;
          font-size: 18px;
          border-radius: 8px;
        }
      `}</style>

      <NavHeader />

      <div id="page-home" style={{ maxWidth: 'none', padding: 0 }}>
        <div className="home-hero">
          <div className="home-hero-text">
            <h1>
              <span className="w-coral">Group</span>, <span className="w-sage">save</span> and{' '}
              <span className="w-azure">share</span> links
              <br />
              with the world
            </h1>
            <p>
              Create curated link collections with rich previews, custom URLs, and drag-to-reorder.
              No sign-up needed.
            </p>
          </div>

          <div className="home-preview">
            <div className="home-preview-header">
              <div className="home-preview-slug">/awesome-frontend-tools</div>
              <div className="home-preview-meta">3 links · published just now</div>
            </div>
            <div className="home-preview-item">
              <div className="home-preview-thumb">V</div>
              <div>
                <div className="home-preview-title">Vite — Next Generation Frontend Tooling</div>
                <div className="home-preview-url">vitejs.dev</div>
              </div>
            </div>
            <div className="home-preview-item">
              <div className="home-preview-thumb">T</div>
              <div>
                <div className="home-preview-title">Tailwind CSS — Rapidly build modern websites</div>
                <div className="home-preview-url">tailwindcss.com</div>
              </div>
            </div>
            <div className="home-preview-item">
              <div className="home-preview-thumb">TS</div>
              <div>
                <div className="home-preview-title">TypeScript Playground</div>
                <div className="home-preview-url">typescriptlang.org/play</div>
              </div>
            </div>
          </div>
        </div>

        <div className="home-cta-section">
          <div className="home-cta-content">
            <div className="label" style={{ textAlign: 'left' }}>
              Add your first link
            </div>
            <form onSubmit={handleUrlSubmit}>
              <div className="home-cta-input-row">
              <input
                name="url"
                type="text"
                className="input input-mono"
                placeholder="https://example.com"
                autoFocus
              />
              <button
                type="submit"
                className="btn btn-primary"
              >
                Go
              </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
