// The served service worker (the toast fix, 2026-07-17).
//
// THE BUG THIS EXISTS TO FIX: the worker used to be a static file in public/
// with a hardcoded SW_VERSION, so its bytes were byte-for-byte identical on
// every deploy. A browser fires `updatefound` / `controllerchange` — the only
// events the refresh toast can listen for — ONLY when the fetched worker
// differs from the installed one. Identical bytes meant those events could
// never fire, so the toast shipped in B2b was unreachable in production no
// matter how correct its decision logic was.
//
// THE FIX: worker/sw.js carries a placeholder, and app/sw.js/route.ts serves
// it with the deploy's identity stamped in. New deploy → new bytes → the
// browser notices → the toast can fire. The route is `force-static`, so the
// read and the stamp both happen during `next build` and the body is baked
// into the prerendered response: no filesystem read at request time.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The token worker/sw.js carries where its version belongs. */
export const SW_VERSION_PLACEHOLDER = '__SW_VERSION__'

/**
 * The version DECLARATION, matched as code rather than as a bare token.
 *
 * This is deliberate and load-bearing: worker/sw.js names the placeholder in
 * its own header prose, so a guard that merely asked "does the source contain
 * __SW_VERSION__ anywhere" would be satisfied by a comment and would wave a
 * hardcoded version straight through — the exact regression this module
 * exists to catch. Matching the declaration also means only the declaration
 * is rewritten, leaving that prose intact and accurate in the served bytes.
 */
const VERSION_DECLARATION = /const SW_VERSION = '__SW_VERSION__';/

/**
 * A version is stamped into a single-quoted JS string literal, so it may only
 * contain characters that cannot terminate or escape one. deployVersion()
 * already yields hex or digits, but swBody is exported: this closes the
 * injection shape for good rather than trusting every future caller.
 */
const SAFE_VERSION = /^[A-Za-z0-9._-]+$/

/**
 * The worker template, read once at module load (build time under the
 * force-static route). Kept as a real .js file rather than a string in here
 * so the caching posture stays lintable, highlightable, and diffable.
 */
export const SW_SOURCE = readFileSync(join(process.cwd(), 'worker', 'sw.js'), 'utf8')

/**
 * This deploy's identity, resolved at build time.
 *
 * Vercel provides VERCEL_GIT_COMMIT_SHA automatically (no new env var); the
 * BUILD_TIME fallback is baked by next.config.js and moves on every build, so
 * the bytes change per deploy even if the SHA is ever unavailable.
 *
 * The two resolve by DIFFERENT mechanisms, and the difference matters to
 * anyone editing this: BUILD_TIME is inlined textually at build because it is
 * a key in next.config's `env` (it is gone from the compiled bundle). The SHA
 * is NOT inlined — it survives as a real process.env read, and it holds a
 * value only because app/sw.js/route.ts is `force-static`, so this runs
 * inside `next build` where Vercel's build environment supplies it. That
 * directive is what makes the SHA work; nothing else does.
 *
 * Redeploying the SAME commit yields the same version on purpose: identical
 * code is not a new version, and the toast should stay quiet.
 */
export function deployVersion(
  sha: string | undefined = process.env.VERCEL_GIT_COMMIT_SHA,
  builtAt: string | undefined = process.env.BUILD_TIME,
): string {
  const commit = sha?.trim()
  if (commit) return `sha-${commit.slice(0, 12)}`
  const stamp = builtAt?.trim()
  if (stamp) return `build-${stamp.replace(/[^0-9]/g, '').slice(0, 14)}`
  // Neither available (never true under `next build`, which always bakes
  // BUILD_TIME). A stable literal, so a local dev server does not churn.
  return 'dev'
}

/**
 * The bytes served at /sw.js: the template with its version stamped in.
 *
 * Throws rather than serving a worker that can never change — a missing
 * placeholder or an empty version is exactly the silent regression this
 * module exists to prevent, and under the build-time route a throw fails the
 * build loudly instead of shipping a mute worker.
 */
export function swBody(version: string, source: string = SW_SOURCE): string {
  if (!version.trim()) {
    throw new Error('sw-source: refusing to serve /sw.js with an empty version.')
  }
  if (!SAFE_VERSION.test(version)) {
    throw new Error(
      `sw-source: version ${JSON.stringify(version)} is not a bare identifier. ` +
        'It is stamped into a JS string literal and must not be able to break out of it.',
    )
  }
  if (!VERSION_DECLARATION.test(source)) {
    throw new Error(
      "sw-source: worker/sw.js no longer declares const SW_VERSION = '__SW_VERSION__'. " +
        'Its bytes would be identical on every deploy and the update toast would go silent.',
    )
  }
  return source.replace(VERSION_DECLARATION, `const SW_VERSION = '${version}';`)
}
