// Authority matrix — the single versioned source of who may do what in the
// admin command center. Session 2's gates API (fox-underwriting repo) will
// enforce the SAME permission keys server-side, so treat key names as a
// contract: additive changes only; renames require a CLAUDE.md note.
//
// This module is intentionally pure and isomorphic (no Clerk, no next/*
// imports) so both server layouts and client nav components can consume it.
// Server-side permission checks live in lib/authz.ts (can, requirePermission).

export const ROLES = ['admin', 'ops', 'underwriting-reviewer', 'agent'] as const

export type Role = (typeof ROLES)[number]

export const PERMISSIONS = {
  'approvals.statement.decide': ['admin'],
  'approvals.ratesheet.decide': ['admin'],
  'flags.disposition': ['admin'],
  'shadow.score': ['admin'],
  // Session 4, matching the gates API contract (micro-session 2):
  'conditions.decide': ['admin'],
  'deals.view': ['admin', 'ops', 'underwriting-reviewer', 'agent'],
  'compliance.view': ['admin', 'ops'],
  'audit.view': ['admin'],
  'partners.provision': ['admin'],
  'portals.view-as': ['admin'],
  'settings.manage': ['admin'],
  // ── Additive view keys (Session 1) ─────────────────────────────────────
  // Nav and page gating for sections the original matrix carries no key
  // for. All seeded admin-only except where a broader default is safe.
  'approvals.view': ['admin'],
  'rates.view': ['admin'],
  'intel.view': ['admin'],
  // Widened Session 4 to every internal role, matching the gates API
  // contract (knowledge is reference material, not tenant data).
  'knowledge.view': ['admin', 'ops', 'underwriting-reviewer', 'agent'],
  'revenue.view': ['admin'],
  'status.view': ['admin', 'ops'],
  // Session 4: acknowledging a triaged form-intake failure is a write on
  // this repo's own FOXCA project; admin only.
  'status.acknowledge': ['admin'],
  'bookkeeping.view': ['admin'],
  'roadmap.view': ['admin', 'ops', 'underwriting-reviewer', 'agent'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

// Normalize the role shapes that exist in production Clerk publicMetadata.
// Three shapes are live and all must resolve to string[]:
//   1. roles: ['financial-planner']   (plural key, array)
//   2. roles: 'investor'              (plural key, bare string)
//   3. role:  'admin'                 (legacy singular key)
// Unknown values degrade to an empty grant set — never a crash, never access.
export function normalizeRoles(metadata: {
  roles?: unknown
  role?: unknown
}): string[] {
  const raw = metadata?.roles
  if (Array.isArray(raw)) return raw.filter((r): r is string => typeof r === 'string')
  if (typeof raw === 'string' && raw.length > 0) return [raw]
  if (typeof metadata?.role === 'string' && metadata.role.length > 0) return [metadata.role]
  return []
}

// Pure permission check. Roles outside the known matrix simply grant
// nothing; permissions outside the matrix deny by default.
export function roleCan(roles: readonly string[], permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[] | undefined
  if (!allowed) return false
  return roles.some(r => allowed.includes(r))
}
