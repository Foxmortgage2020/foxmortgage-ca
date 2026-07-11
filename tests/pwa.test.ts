import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '..')
const swSource = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8')
const manifestSource = fs.readFileSync(
  path.join(root, 'public/manifest.webmanifest'),
  'utf8'
)

describe('service worker caching posture', () => {
  it('defines and uses the isCacheable guard', () => {
    expect(swSource).toMatch(/function\s+isCacheable\s*\(/)
    // The guard must be invoked before caching, not merely declared.
    const calls = swSource.match(/isCacheable\s*\(/g) || []
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

  it('pins the version and cache name', () => {
    expect(swSource).toMatch(/SW_VERSION\s*=\s*['"]fox-s9-v1['"]/)
    expect(swSource).toMatch(/fox-static-/)
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
