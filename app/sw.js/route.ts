// Serves the service worker at /sw.js with this deploy's identity stamped in
// (the toast fix, 2026-07-17). The worker used to be a static file whose
// bytes never changed, which made the browser's update events — and so the
// refresh toast — unreachable in production. See lib/sw-source.ts.
//
// force-static: the read and the stamp happen during `next build`, and the
// body is baked into the prerendered response. Nothing reads the filesystem
// at request time, and the tree stays clean (no generated file is written).
//
// The path stays /sw.js at the root so the worker keeps its root scope and
// every already-registered browser picks the new bytes up at its next check.
// Clerk's middleware matcher excludes any path with a file extension, so
// /sw.js needs no publicRoutes entry.

import { deployVersion, swBody } from '@/lib/sw-source'

export const dynamic = 'force-static'

export function GET() {
  return new Response(swBody(deployVersion()), {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      // Let the browser revalidate every check. (Registrations default to
      // updateViaCache 'imports', which already bypasses the HTTP cache for
      // the worker script itself; this is the belt to that pair of braces.)
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  })
}
