// Permission checks for the four gate decision keys — the 403 path's
// server-side source of truth. Every gate proxy route runs apiPermission()
// over these before any Gates API call, so a non-admin role never reaches
// the network.

import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLES,
  normalizeRoles,
  roleCan,
  type Permission,
} from '../config/authority'
import { effectiveAccess } from '../lib/effective-access'
import { ADMIN_NAV } from '../config/admin-nav'

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

// ─── Session 8: shipped role baselines ──────────────────────────────────────
// The exact per-role grant sets the brief records as the day-one surface.
// Editing config/authority.ts intentionally breaks these — update both.

const ALL_KEYS = Object.keys(PERMISSIONS) as Permission[]
const grantSet = (role: string) => ALL_KEYS.filter(k => roleCan([role], k)).sort()

describe('session 8 role baselines', () => {
  it('ops baseline: views only, no decide keys', () => {
    expect(grantSet('ops')).toEqual(
      [
        'deals.view',
        'compliance.view',
        'knowledge.view',
        'status.view',
        'roadmap.view',
        // Phase B2: recomputing document presence is read-only and open to
        // every internal role (it decides nothing).
        'conditions.recompute',
        // Analysis session: opening a deal document for an analysis citation is
        // a read, open to every internal role (tenancy-scoped in the workbench).
        'document.view',
        // A2: the native task list is a read for every internal role, matching
        // fox-underwriting's own tasks.view grant.
        'tasks.view',
      ].sort(),
    )
  })

  it('underwriting-reviewer baseline: ops plus approvals visibility and agent.use', () => {
    expect(grantSet('underwriting-reviewer')).toEqual(
      [
        'deals.view',
        'compliance.view',
        'knowledge.view',
        'status.view',
        'roadmap.view',
        'approvals.view',
        'agent.use',
        'conditions.recompute',
        'document.view',
        'tasks.view',
      ].sort(),
    )
  })

  it('underwriting-reviewer is a strict superset of ops', () => {
    for (const key of grantSet('ops')) {
      expect(roleCan(['underwriting-reviewer'], key)).toBe(true)
    }
  })

  it('agent baseline: their own scope', () => {
    expect(grantSet('agent')).toEqual(
      [
        'deals.view',
        'knowledge.view',
        'agent.use',
        'roadmap.view',
        'conditions.recompute',
        'document.view',
        'tasks.view',
      ].sort(),
    )
  })

  it('decision and provisioning keys stay admin-only', () => {
    const adminOnly: Permission[] = [
      'approvals.statement.decide',
      'approvals.ratesheet.decide',
      'flags.disposition',
      'shadow.score',
      'conditions.decide',
      'commitment.upload',
      // N-06 (2026-07-29): running the native Lender Notes Generator against
      // the Zoho file overwrites Lender_Notes on the CRM record of truth, so
      // it joins this list rather than riding notes.generate, which is a
      // workbench draft that sends nothing.
      'notes.crm.write',
      'approvals.conditions.decide',
      'knowledge.contact.manage',
      'comms.decide',
      'agent.execute',
      'compliance.manage',
      'constraints.manage',
      'tasks.complete',
      // A2: the native task writes. MIRRORS fox-underwriting's own
      // PERMISSIONS['tasks.manage'] === ['admin'] — the two files are a
      // contract, and a widening here without one there just produces 403s
      // from the gates API.
      'tasks.manage',
      'status.acknowledge',
      'people.manage',
      'agents.provision',
      'partners.provision',
      'portals.view-as',
      'settings.manage',
      'audit.view',
    ]
    for (const key of adminOnly) {
      expect(PERMISSIONS[key]).toEqual(['admin'])
    }
  })

  it('every permission key carries a label', () => {
    for (const key of ALL_KEYS) {
      expect(typeof PERMISSION_LABELS[key]).toBe('string')
      expect(PERMISSION_LABELS[key].length).toBeGreaterThan(0)
    }
  })
})

// ─── Session 8: effective-access view ───────────────────────────────────────

describe('effectiveAccess', () => {
  it('covers every nav page and every non-nav permission, for every role', () => {
    // Ask Fox left the nav list for the sidebar footer (2026-07-14 shell
    // redesign) but stays a stated page in the matrix: nav + 1.
    const navPermissions = new Set([...ADMIN_NAV.map(i => i.permission), 'agent.use'])
    for (const role of ROLES) {
      const access = effectiveAccess(role)
      expect(access.pages.length).toBe(ADMIN_NAV.length + 1)
      expect(access.actions.length).toBe(ALL_KEYS.filter(k => !navPermissions.has(k)).length)
    }
  })

  it('admin reaches every page and every action', () => {
    const access = effectiveAccess('admin')
    expect(access.pages.every(p => p.allowed)).toBe(true)
    expect(access.actions.every(a => a.allowed)).toBe(true)
  })

  it('agrees with roleCan for every role and entry', () => {
    for (const role of ROLES) {
      const access = effectiveAccess(role)
      for (const p of access.pages) expect(p.allowed).toBe(roleCan([role], p.permission))
      for (const a of access.actions) expect(a.allowed).toBe(roleCan([role], a.key))
    }
  })

  it('ops sees no approval queues; underwriting-reviewer sees them; agent sees Ask Fox', () => {
    const ops = effectiveAccess('ops')
    const ur = effectiveAccess('underwriting-reviewer')
    const agent = effectiveAccess('agent')
    const page = (a: ReturnType<typeof effectiveAccess>, label: string) =>
      a.pages.find(p => p.label === label)!
    expect(page(ops, 'Approvals').allowed).toBe(false)
    expect(page(ur, 'Approvals').allowed).toBe(true)
    expect(page(agent, 'Ask Fox').allowed).toBe(true)
    expect(page(ops, 'Ask Fox').allowed).toBe(false)
    // Visibility never implies decide: UR sees the queues, holds no decide keys.
    expect(ur.actions.find(a => a.key === 'conditions.decide')!.allowed).toBe(false)
  })
})
