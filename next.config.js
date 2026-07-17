/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Baked at build time; the admin Status page shows it as the deploy's
    // build timestamp (Vercel exposes no deploy-time env var).
    BUILD_TIME: new Date().toISOString(),
  },
  async redirects() {
    return [
      {
        // Phase B1: Deals became Underwriting. The LIST route moved; deal
        // ROOMS keep their /portal/admin/deals/[id] URLs (no :path* here).
        source: '/portal/admin/deals',
        destination: '/portal/admin/underwriting',
        permanent: true,
      },
      // B3 (2026-07-17): the lifecycle-shaped menu. Every merged page's old
      // path resolves permanently to its new tab; SUBROUTES stay live at
      // their own paths (renewals/drip, opportunities/backfill,
      // knowledge/[slug], bookkeeping/review-queue, bookkeeping/projects),
      // so nothing bookmarked or installed breaks.
      {
        source: '/portal/admin/renewals',
        destination: '/portal/admin/beyond?tab=renewals',
        permanent: true,
      },
      {
        source: '/portal/admin/opportunities',
        destination: '/portal/admin/beyond?tab=opportunities',
        permanent: true,
      },
      {
        source: '/portal/admin/rates',
        destination: '/portal/admin/lenders?tab=rates',
        permanent: true,
      },
      {
        source: '/portal/admin/intel',
        destination: '/portal/admin/lenders?tab=intel',
        permanent: true,
      },
      {
        source: '/portal/admin/knowledge',
        destination: '/portal/admin/lenders?tab=knowledge',
        permanent: true,
      },
      {
        // Cross-prefix: the bookkeeping landing folded into Revenue. Its
        // working subpages keep their /portal/bookkeeping/* paths.
        source: '/portal/bookkeeping',
        destination: '/portal/admin/revenue?tab=bookkeeping',
        permanent: true,
      },
    ];
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
      {
        // A client's own file page (B5). Belt-and-suspenders alongside the
        // robots metadata on the page itself: a private link must never be
        // indexed, and a crawler that ignores the meta tag still sees this.
        source: '/portal/file/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
          {
            // Nothing about a client's page should ride out in a referrer.
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
