import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { swBody } from '../lib/sw-source'

const root = path.resolve(__dirname, '..')
// The toast fix (2026-07-17) moved the worker out of public/: it is a
// TEMPLATE now, served at /sw.js by app/sw.js/route.ts with the deploy's
// version stamped in (a static file's bytes never changed, so the browser
// never saw a new worker). The posture below is asserted on the template AND
// on the served bytes — stamping must not open a hole.
const swSource = fs.readFileSync(path.join(root, 'worker/sw.js'), 'utf8')
const manifestSource = fs.readFileSync(
  path.join(root, 'public/manifest.webmanifest'),
  'utf8'
)

// The posture lives in the CODE, not in the essay above it. The worker's
// header comment discusses isCacheable(url) by name, so counting occurrences
// across the whole file would let the prose alone satisfy "the guard is
// actually invoked" — a security assertion that a comment can pass is not an
// assertion. Strip comments before counting.
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const swCode = codeOnly(swSource)

describe('service worker caching posture', () => {
  it('defines and uses the isCacheable guard', () => {
    expect(swCode).toMatch(/function\s+isCacheable\s*\(/)
    // The guard must be invoked before caching, not merely declared — and the
    // count runs on code, so the header comment cannot satisfy it.
    const calls = swCode.match(/isCacheable\s*\(/g) || []
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('treats /api and /portal as network-only (never cached)', () => {
    // Both authenticated surfaces are short-circuited in the fetch handler.
    expect(swSource).toMatch(/pathname\.startsWith\(\s*['"]\/api['"]\s*\)/)
    expect(swSource).toMatch(/pathname\.startsWith\(\s*['"]\/portal['"]\s*\)/)
    // A branch guards them together as network-only.
    expect(swSource).toMatch(
      /startsWith\(['"]\/api['"]\)\s*\|\|\s*url\.pathname\.startsWith\(['"]\/portal['"]\)/
    )
  })

  it('isCacheable returns false for /api and /portal', () => {
    // Reconstruct the guard from source and exercise it directly.
    const iso = /function\s+isCacheable\s*\(url\)\s*\{[\s\S]*?\n\}/.exec(swSource)
    expect(iso).not.toBeNull()
    // eslint-disable-next-line no-new-func
    const guard = new Function(
      'url',
      iso![0].replace(/^function\s+isCacheable\s*\(url\)\s*\{/, '').replace(/\}$/, '')
    ) as (url: { pathname: string }) => boolean
    expect(guard({ pathname: '/api/portal/admin/deals' })).toBe(false)
    expect(guard({ pathname: '/portal/admin' })).toBe(false)
    expect(guard({ pathname: '/icons/icon-192.png' })).toBe(true)
    expect(guard({ pathname: '/_next/static/chunk.js' })).toBe(true)
  })

  it('STATIC_ASSETS precache contains no /api or /portal entries', () => {
    const m = /STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/.exec(swSource)
    expect(m).not.toBeNull()
    const block = m![1]
    expect(block).not.toMatch(/\/api/)
    expect(block).not.toMatch(/\/portal/)
    // It should still precache the offline page and manifest.
    expect(block).toMatch(/\/offline/)
    expect(block).toMatch(/\/manifest\.webmanifest/)
  })

  it('documents the caching posture in a top-of-file comment', () => {
    expect(swSource).toMatch(/SERVICE WORKER CACHING POSTURE \(Session 9\)/)
  })

  it('carries the version placeholder, never a hardcoded version', () => {
    // A hardcoded version is THE bug the toast fix removed: identical bytes
    // every deploy, so the browser never fires an update event and the toast
    // is unreachable. The cache name still rides the version.
    expect(swSource).toMatch(/SW_VERSION\s*=\s*['"]__SW_VERSION__['"]/)
    expect(swSource).toMatch(/fox-static-/)
  })

  it('the SERVED bytes keep the posture (stamping opens no hole)', () => {
    const served = swBody('sha-testtesttest')
    // The guard survives the stamp, still called before every cache.put.
    expect(served).toMatch(/function\s+isCacheable\s*\(/)
    expect((served.match(/isCacheable\s*\(/g) || []).length).toBeGreaterThanOrEqual(2)
    // /api and /portal are still network-only in the served worker.
    expect(served).toMatch(
      /startsWith\(['"]\/api['"]\)\s*\|\|\s*url\.pathname\.startsWith\(['"]\/portal['"]\)/
    )
    // And the precache still names no authenticated surface.
    const block = /STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/.exec(served)![1]
    expect(block).not.toMatch(/\/api/)
    expect(block).not.toMatch(/\/portal/)
  })
})

describe('web manifest', () => {
  const manifest = JSON.parse(manifestSource)

  it('parses as JSON with the required install fields', () => {
    expect(manifest.start_url).toBe('/portal/admin')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#032133')
    expect(manifest.scope).toBe('/')
  })

  it('declares at least four icons including a maskable purpose', () => {
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4)
    const hasMaskable = manifest.icons.some(
      (i: { purpose?: string }) =>
        typeof i.purpose === 'string' && i.purpose.includes('maskable')
    )
    expect(hasMaskable).toBe(true)
  })
})
