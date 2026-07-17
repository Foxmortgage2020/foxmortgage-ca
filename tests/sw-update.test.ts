// The version toast (B2b, Task 8): pure detection logic. The component
// never auto-reloads — these rules only decide when the quiet toast may
// appear; the Refresh press is the human's.

import { describe, expect, it } from 'vitest'
import {
  controllerChangeMeansUpdate,
  installedBehindController,
  updateReadyNow,
} from '../lib/sw-update'

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
