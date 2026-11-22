import type { NextConfig } from 'next';

// Where /api/* is proxied to. Same variable the client bundle reads, so one
// setting on Vercel moves both; read here at build time.
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dashboard calls the API through its own origin, so the refresh
  // token can live in a first-party httpOnly SameSite=Strict cookie instead
  // of localStorage (backend/src/auth/refresh-cookie.ts). Webhook URLs and
  // the Google sign-in start still point at the API directly.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/:path*` }];
  },
  async headers() {
    return [{
      // Hero filenames contain a content hash, so cached copies survive deploys safely.
      source: '/images/hero-bridge-:asset',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    }];
  },
};

export default nextConfig;
