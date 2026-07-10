// Permission checks for the four gate decision keys — the 403 path's
// server-side source of truth. Every gate proxy route runs apiPermission()
// over these before any Gates API call, so a non-admin role never reaches
// the network.

import { describe, expect, it } from 'vitest'
import { normalizeRoles, roleCan } from '../config/authority'

const GATE_PERMISSIONS = [
  'approvals.statement.decide',
  'approvals.ratesheet.decide',
  'flags.disposition',
  'shadow.score',
] as const

describe('gate decision permissions', () => {
  it('admin holds all four decision keys', () => {
    for (const p of GATE_PERMISSIONS) expect(roleCan(['admin'], p)).toBe(true)
  })

  it('every non-admin role is denied all four decision keys', () => {
    const nonAdmins = [
      ['ops'],
      ['underwriting-reviewer'],
      ['agent'],
      ['financial-planner'],
      ['investor'],
      ['realtor'],
      [],
    ]
    for (const roles of nonAdmins) {
      for (const p of GATE_PERMISSIONS) expect(roleCan(roles, p)).toBe(false)
    }
  })

  it('audit.view is admin-only', () => {
    expect(roleCan(['admin'], 'audit.view')).toBe(true)
    expect(roleCan(['ops'], 'audit.view')).toBe(false)
    expect(roleCan(['agent'], 'audit.view')).toBe(false)
  })

  it('unknown and malformed role shapes degrade to no access', () => {
    expect(roleCan(normalizeRoles({ roles: 'investor' }), 'flags.disposition')).toBe(false)
    expect(roleCan(normalizeRoles({ role: 'mystery-role' }), 'shadow.score')).toBe(false)
    expect(roleCan(normalizeRoles({ roles: [42, null] as unknown as string[] }), 'audit.view')).toBe(false)
    expect(roleCan(normalizeRoles({}), 'approvals.statement.decide')).toBe(false)
  })
})
