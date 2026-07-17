// The version toast (B2b, Task 8): pure detection logic. The component
// never auto-reloads — these rules only decide when the quiet toast may
// appear; the Refresh press is the human's.
//
// The toast fix (2026-07-17) adds the half that was missing. The decision
// rules below were always right and always green, while in production the
// events they listen for could never fire: the served worker's bytes never
// changed, and nothing ever asked the browser to check. So these suites now
// also prove the TRIGGERS — the interval, the visibility handler, and that
// the served /sw.js actually carries a per-deploy identity.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  UPDATE_CHECK_INTERVAL_MS,
  controllerChangeMeansUpdate,
  installedBehindController,
  scheduleUpdateChecks,
  updateReadyNow,
  type UpdateCheckHost,
} from '../lib/sw-update'
import { SW_SOURCE, SW_VERSION_PLACEHOLDER, deployVersion, swBody } from '../lib/sw-source'
import { GET, dynamic } from '../app/sw.js/route'

describe('updateReadyNow (a waiting worker found at registration)', () => {
  it('ready when an installed worker waits behind an existing controller', () => {
    expect(updateReadyNow({ waiting: { state: 'installed' }, installing: null }, true)).toBe(true)
  })
  it('never ready on first install (no controller yet)', () => {
    expect(updateReadyNow({ waiting: { state: 'installed' }, installing: null }, false)).toBe(false)
  })
  it('never ready without a waiting worker, or one not yet installed', () => {
    expect(updateReadyNow({ waiting: null, installing: { state: 'installing' } }, true)).toBe(false)
    expect(updateReadyNow({ waiting: { state: 'installing' }, installing: null }, true)).toBe(false)
  })
})

describe('installedBehindController (updatefound → statechange)', () => {
  it('ready exactly when the state lands on installed with a controller', () => {
    expect(installedBehindController('installed', true)).toBe(true)
    expect(installedBehindController('installed', false)).toBe(false)
    expect(installedBehindController('installing', true)).toBe(false)
    expect(installedBehindController('activated', true)).toBe(false)
  })
})

describe('controllerChangeMeansUpdate', () => {
  it('a controller change is an update only for a page that had one', () => {
    expect(controllerChangeMeansUpdate(true)).toBe(true)
    // First install claiming clients is not new code to refresh into.
    expect(controllerChangeMeansUpdate(false)).toBe(false)
  })
})

// ─── The triggers: something has to ask the browser to look ─────────────────

function fakeHost(visible = true) {
  const listeners: (() => void)[] = []
  const host: UpdateCheckHost & { fireVisibility: () => void; visible: boolean } = {
    visible,
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: id => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
    addVisibilityListener: fn => listeners.push(fn),
    removeVisibilityListener: fn => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    },
    isVisible: () => host.visible,
    fireVisibility: () => listeners.forEach(l => l()),
  }
  return host
}

describe('scheduleUpdateChecks (the missing triggers)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks for a check on every interval tick', () => {
    vi.useFakeTimers()
    const check = vi.fn()
    const stop = scheduleUpdateChecks(check, fakeHost())
    expect(check).not.toHaveBeenCalled()

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS - 1)
    expect(check).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(1)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2)
    expect(check).toHaveBeenCalledTimes(3)
    stop()
  })

  it('the interval is ten minutes — an idle tab never waits on the browser’s own 24h check', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(10 * 60 * 1000)
  })

  it('asks for a check when the tab becomes visible, and not when it hides', () => {
    vi.useFakeTimers()
    const check = vi.fn()
    const host = fakeHost(true)
    const stop = scheduleUpdateChecks(check, host)

    host.fireVisibility()
    expect(check).toHaveBeenCalledTimes(1)

    host.visible = false // the tab went away: a hidden tab is not a return
    host.fireVisibility()
    expect(check).toHaveBeenCalledTimes(1)

    host.visible = true // and back
    host.fireVisibility()
    expect(check).toHaveBeenCalledTimes(2)
    stop()
  })

  it('teardown stops the timer and drops the listener (no leak on unmount)', () => {
    vi.useFakeTimers()
    const check = vi.fn()
    const host = fakeHost()
    const stop = scheduleUpdateChecks(check, host)
    stop()

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3)
    host.fireVisibility()
    expect(check).not.toHaveBeenCalled()
  })
})

// ─── The served worker carries the deploy's identity ────────────────────────

describe('swBody (why the toast could never fire before)', () => {
  it('two deploys produce different bytes — the whole point', () => {
    const a = swBody('sha-1111aaaa2222')
    const b = swBody('sha-3333bbbb4444')
    expect(a).not.toBe(b)
    expect(a).toContain('sha-1111aaaa2222')
    expect(b).toContain('sha-3333bbbb4444')
  })

  it('the same deploy is byte-identical (a redeploy of one commit is not a new version)', () => {
    expect(swBody('sha-1111aaaa2222')).toBe(swBody('sha-1111aaaa2222'))
  })

  it('stamps the declaration, and rotates the cache name with it', () => {
    const body = swBody('sha-deadbeef')
    // The DECLARATION must be stamped. (The worker's header prose still names
    // the placeholder, on purpose: it documents how the file works, and only
    // the declaration is rewritten.)
    expect(body).not.toMatch(/SW_VERSION = '__SW_VERSION__'/)
    expect(body).toContain("const SW_VERSION = 'sha-deadbeef'")
    // STATIC_CACHE is derived from SW_VERSION, so it rotates per deploy and
    // the activate handler deletes every cache that is not the current one.
    expect(body).toMatch(/STATIC_CACHE\s*=\s*'fox-static-'\s*\+\s*SW_VERSION/)
    expect(body).toMatch(/\.filter\(\(name\) => name !== STATIC_CACHE\)/)
    expect(body).toMatch(/caches\.delete\(name\)/)
  })

  it('refuses to serve a worker that could never change', () => {
    // The regression this module exists to prevent: a hardcoded version.
    expect(() => swBody('sha-ok', "const SW_VERSION = 'fox-s9-v1';")).toThrow(/SW_VERSION/)
    expect(() => swBody('  ', SW_SOURCE)).toThrow(/empty version/)
  })

  it('a placeholder in PROSE cannot satisfy the guard (it must be the declaration)', () => {
    // The worker's own header names the placeholder. A guard that accepted any
    // occurrence would wave a hardcoded version through on the strength of a
    // comment — which is the whole failure this module exists to prevent.
    const proseOnly = `// this file stamps ${SW_VERSION_PLACEHOLDER} at build\nconst SW_VERSION = 'fox-s9-v1';`
    expect(() => swBody('sha-ok', proseOnly)).toThrow(/SW_VERSION/)
  })

  it('refuses a version that could break out of the string literal', () => {
    expect(() => swBody("x'; fetch('/api/portal/admin/deals'); //")).toThrow(/bare identifier/)
    expect(() => swBody('has spaces')).toThrow(/bare identifier/)
    expect(() => swBody('line\nbreak')).toThrow(/bare identifier/)
  })

  it('the template still carries the placeholder declaration (the source of the bytes)', () => {
    expect(SW_SOURCE).toMatch(/const SW_VERSION = '__SW_VERSION__';/)
  })
})

// NOTE: deployVersion's parameters are DEFAULTED to process.env, and a JS
// default fires on an explicitly passed `undefined` — so passing `undefined`
// here would silently re-read the ambient environment and test the shell
// instead of the fallback. (Proven: with VERCEL_GIT_COMMIT_SHA exported,
// those assertions fail.) Every case below passes an explicit empty string,
// which is absent-but-not-undefined, so the defaults never fire.
// ─── The route: the one place the stamp reaches a browser ───────────────────
//
// Without this, the two halves are tested in isolation and the CALL SITE that
// makes them real is not: gutting GET to serve the template unstamped would
// keep every other test green and restore the exact original bug. Given this
// session exists because a green suite hid a dead feature, that gap is the
// one that must not be left open.

describe('GET /sw.js (the served route)', () => {
  it('serves a stamped worker, never the raw template', async () => {
    const res = GET()
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(body).not.toMatch(/SW_VERSION = '__SW_VERSION__'/)
    expect(body).toMatch(/const SW_VERSION = '[A-Za-z0-9._-]+';/)
    // The worker itself, not something else.
    expect(body).toMatch(/function isCacheable\(/)
  })

  it('is force-static, so the stamp happens at build and not per request', () => {
    // If this ever flips, the version is resolved at request time and every
    // request could serve different bytes.
    expect(dynamic).toBe('force-static')
  })

  it('serves it as JavaScript the browser will revalidate', async () => {
    const res = GET()
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    expect(res.headers.get('cache-control')).toMatch(/must-revalidate/)
  })
})

describe('deployVersion', () => {
  it('prefers the commit SHA Vercel provides, truncated', () => {
    expect(deployVersion('3ba0125d51f1f1a16bb6d28e039ddb4737c05b51', '')).toBe('sha-3ba0125d51f1')
  })

  it('falls back to the build stamp, which moves every build', () => {
    const a = deployVersion('', '2026-07-17T12:00:00.000Z')
    const b = deployVersion('', '2026-07-17T12:31:04.000Z')
    expect(a).toBe('build-20260717120000')
    expect(a).not.toBe(b)
  })

  it('degrades to a stable literal rather than churning a dev server', () => {
    expect(deployVersion('', '')).toBe('dev')
    expect(deployVersion('   ', '  ')).toBe('dev')
  })

  it('every resolved version is stampable (no shape can break swBody)', () => {
    for (const v of [
      deployVersion('3ba0125d51f1f1a16bb6d28e039ddb4737c05b51', ''),
      deployVersion('', '2026-07-17T12:00:00.000Z'),
      deployVersion('', ''),
    ]) {
      expect(() => swBody(v)).not.toThrow()
    }
  })
})
