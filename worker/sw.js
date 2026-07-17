/*
 * ============================================================================
 * SERVICE WORKER CACHING POSTURE (Session 9)
 * ============================================================================
 * THIS FILE IS A TEMPLATE, NOT A SERVED ASSET (the toast fix, 2026-07-17).
 * It lives outside public/ and is served at /sw.js by app/sw.js/route.ts,
 * which replaces __SW_VERSION__ with the deploy's identity at BUILD time. It
 * used to sit in public/ with a hardcoded version, so its bytes were
 * identical on every deploy — and a browser only fires the update events the
 * refresh toast listens for when the fetched worker differs byte-for-byte
 * from the installed one. A hardcoded version means a silent worker forever.
 * NEVER hardcode SW_VERSION here again; the placeholder is load-bearing and
 * lib/sw-source.ts fails the build if it goes missing.
 *
 * The security posture IS the product. This service worker is deliberately
 * minimal and NEVER caches authenticated content. Read these rules before
 * touching anything below.
 *
 * WHAT WE CACHE (and it is the entire list):
 *   - A tiny precache of truly static, public assets: the offline fallback
 *     page, the web manifest, and the app icons.
 *   - Public static build assets served at runtime (/_next/static/, /icons/,
 *     /assets/, and plain .css/.js/.woff2/.png/.svg/.ico/.webmanifest files)
 *     that are NOT under /api or /portal.
 *
 * WHAT WE NEVER CACHE, EVER:
 *   - Anything under /api. These are data endpoints. Borrower data, workbench
 *     reads, gate decisions, Zoho payloads — none of it may ever touch the
 *     Cache Storage. These requests are NETWORK-ONLY.
 *   - Anything under /portal. Every authenticated page (admin command center,
 *     investor, FP, realtor portals) is NETWORK-ONLY. We never read a cached
 *     /portal response and we never write one. If a /portal navigation fails
 *     offline we may show the generic /offline page, but the /portal response
 *     itself is never stored.
 *   - Any cross-origin request. Passed straight through to the network.
 *   - Any non-GET request. Passed straight through to the network.
 *
 * THE BORROWER-DATA GUARD:
 *   isCacheable(url) returns false for any /api or /portal path and is called
 *   before EVERY cache.put in this file. No code path can cache authenticated
 *   content — the guard is the single chokepoint that enforces it.
 * ============================================================================
 */

// Stamped per deploy by app/sw.js/route.ts. The cache name rides the version,
// so every deploy opens a fresh cache and the activate handler below deletes
// every cache that is not the current one (no leak, no stale asset).
const SW_VERSION = '__SW_VERSION__';
const STATIC_CACHE = 'fox-static-' + SW_VERSION;

// Precache ONLY small, public, static assets. Never a /portal page, never /api.
const STATIC_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/apple-touch-icon.png',
];

// The single chokepoint: authenticated surfaces are never cacheable.
function isCacheable(url) {
  if (url.pathname.startsWith('/api')) return false;
  if (url.pathname.startsWith('/portal')) return false;
  return true;
}

function isStaticAsset(url) {
  const p = url.pathname;
  if (p.startsWith('/_next/static/')) return true;
  if (p.startsWith('/icons/')) return true;
  if (p.startsWith('/assets/')) return true;
  return /\.(css|js|woff2|png|svg|ico|webmanifest)$/.test(p);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== STATIC_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Non-GET: never intercept, let it hit the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 2. Cross-origin: network-only passthrough, no caching.
  if (url.origin !== self.location.origin) return;

  // 3. /api or /portal: NETWORK-ONLY (the borrower-data guard). Never read or
  //    write the cache for these. A failed /portal navigation may fall back to
  //    the offline page, but the /portal response itself is NEVER cached.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/portal')) {
    event.respondWith(
      fetch(request).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/offline');
        }
        return Response.error();
      })
    );
    return;
  }

  // 4. Top-level navigations: network-first, offline fallback, never cached.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline'))
    );
    return;
  }

  // 5. Public static assets: cache-first, populate the static cache.
  if (isStaticAsset(url) && isCacheable(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (
            response &&
            response.status === 200 &&
            response.type === 'basic' &&
            isCacheable(url)
          ) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // 6. Everything else: network-only passthrough.
});
