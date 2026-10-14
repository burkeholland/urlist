import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

// Frame policy: only public list pages requested with ?embed=1 may be framed by other sites.
// Everything else (including /app, /api and the home page, even with ?embed=1) is same-origin only.
const EMBED_REQUEST = { type: 'query', key: 'embed', value: '1' } as const;
// Public list slugs are everything except the reserved prefixes in lib/slug.ts.
const EMBEDDABLE_PATH = '/:first((?!(?:app|api|_next)(?:/|$))[^/]+)/:rest*';

const SAME_ORIGIN_FRAME_HEADERS = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

const EMBED_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "frame-ancestors *",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      { source: '/:path*', missing: [EMBED_REQUEST], headers: SAME_ORIGIN_FRAME_HEADERS },
      { source: '/', headers: SAME_ORIGIN_FRAME_HEADERS },
      { source: '/:first(app|api)/:rest*', headers: SAME_ORIGIN_FRAME_HEADERS },
      {
        source: EMBEDDABLE_PATH,
        has: [EMBED_REQUEST],
        headers: [
          { key: 'Content-Security-Policy', value: EMBED_CONTENT_SECURITY_POLICY },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), clipboard-write=(), web-share=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
