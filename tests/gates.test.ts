// Unit tests for the gates client error mapping — the UX contract from
// docs/gates-api.md (fox-underwriting): 409 renders as already decided,
// 403 as a permission message, 404 as not found or not yours, 422 surfaces
// the server validation message, everything else stays generic. Raw error
// bodies never reach the user.

import { describe, expect, it } from 'vitest'
import { mapGateResponse, STATUS_BY_KIND } from '../lib/gates'

describe('mapGateResponse', () => {
  it('returns null for success statuses', () => {
    expect(mapGateResponse(200, { documentId: 'x' })).toBeNull()
    expect(mapGateResponse(201, {})).toBeNull()
  })

  it('maps 401 to auth', () => {
    const r = mapGateResponse(401, { error: 'invalid token' })
    expect(r?.kind).toBe('auth')
    // Fixed copy, not the server body.
    expect(r?.message).not.toContain('invalid token')
  })

  it('maps 403 to a permission message', () => {
    const r = mapGateResponse(403, { error: 'nope' })
    expect(r?.kind).toBe('forbidden')
    expect(r?.message.toLowerCase()).toContain('permission')
  })

  it('maps 404 to not found or not yours', () => {
    const r = mapGateResponse(404, null)
    expect(r?.kind).toBe('not-found')
    expect(r?.message).toBe('Not found or not yours.')
  })

  it('maps 409 to already decided', () => {
    const r = mapGateResponse(409, { error: 'already decided' })
    expect(r?.kind).toBe('conflict')
    expect(r?.message).toBe('Already decided.')
  })

  it('surfaces the server validation message on 422', () => {
    const r = mapGateResponse(422, { error: 'note must be 2000 characters or fewer' })
    expect(r?.kind).toBe('validation')
    expect(r?.message).toBe('note must be 2000 characters or fewer')
  })

  it('falls back to generic copy when the 422 body is not shaped as expected', () => {
    expect(mapGateResponse(422, 'garbage')?.message).toBe('The decision did not pass validation.')
    expect(mapGateResponse(422, { error: 42 })?.message).toBe('The decision did not pass validation.')
    expect(mapGateResponse(422, null)?.message).toBe('The decision did not pass validation.')
  })

  it('maps 503 to unavailable', () => {
    expect(mapGateResponse(503, { error: 'db not configured' })?.kind).toBe('unavailable')
  })

  it('maps unexpected statuses to unavailable without leaking bodies', () => {
    const r = mapGateResponse(405, { error: 'secret internals' })
    expect(r?.kind).toBe('unavailable')
    expect(r?.message).toBe('Unexpected response (HTTP 405).')
    expect(mapGateResponse(500, null)?.kind).toBe('unavailable')
  })

  it('mirrors every kind to a concrete HTTP status for the portal routes', () => {
    expect(STATUS_BY_KIND.conflict).toBe(409)
    expect(STATUS_BY_KIND.forbidden).toBe(403)
    expect(STATUS_BY_KIND['not-found']).toBe(404)
    expect(STATUS_BY_KIND.validation).toBe(422)
    expect(STATUS_BY_KIND.auth).toBe(401)
    expect(STATUS_BY_KIND.unavailable).toBe(503)
    expect(STATUS_BY_KIND.network).toBe(502)
  })
})
