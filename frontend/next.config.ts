import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      // Hero filenames contain a content hash, so cached copies survive deploys safely.
      source: '/images/hero-bridge-:asset',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    }];
  },
};

export default nextConfig;
