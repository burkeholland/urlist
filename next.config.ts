import type { NextConfig } from "next";

const EMBED_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
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
      {
        source: '/:path*',
        has: [{ type: 'query', key: 'embed', value: '1' }],
        headers: [
          {
            key: 'Content-Security-Policy',
            value: EMBED_CONTENT_SECURITY_POLICY,
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'clipboard-write=(), web-share=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
