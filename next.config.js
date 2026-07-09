/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Baked at build time; the admin Status page shows it as the deploy's
    // build timestamp (Vercel exposes no deploy-time env var).
    BUILD_TIME: new Date().toISOString(),
  },
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Public demo portal must never be indexed (sandboxed sample data).
        source: '/demo/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
