// Effective access — the supervision answer to "what can your staff do."
// Pure derivation from the two configs that already exist: the authority
// matrix (config/authority.ts) and the nav IA (config/admin-nav.ts). No
// third source of truth is introduced; if the matrix or the nav changes,
// this view changes with it. Unit-tested in tests/authority.test.ts.

import { ADMIN_NAV } from '@/config/admin-nav'
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  roleCan,
  type Permission,
  type Role,
} from '@/config/authority'

export interface EffectivePage {
  label: string
  href: string
  permission: Permission
  allowed: boolean
}

export interface EffectiveAction {
  key: Permission
  label: string
  allowed: boolean
}

export interface EffectiveAccess {
  role: Role
  /** Every nav destination, flagged reachable or not for this role. */
  pages: EffectivePage[]
  /** Every non-nav permission (decisions, writes, capabilities). */
  actions: EffectiveAction[]
}

const NAV_PERMISSIONS = new Set<Permission>(ADMIN_NAV.map(item => item.permission))

export function effectiveAccess(role: Role): EffectiveAccess {
  const roles = [role]

  const pages: EffectivePage[] = ADMIN_NAV.map(item => ({
    label: item.label,
    href: item.href,
    permission: item.permission,
    allowed: roleCan(roles, item.permission),
  }))

  const actions: EffectiveAction[] = (Object.keys(PERMISSIONS) as Permission[])
    .filter(key => !NAV_PERMISSIONS.has(key))
    .map(key => ({
      key,
      label: PERMISSION_LABELS[key],
      allowed: roleCan(roles, key),
    }))

  return { role, pages, actions }
}
