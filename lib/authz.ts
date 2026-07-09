// Server-side permission checks for the admin command center.
//
// Reads the Clerk roles[] array through currentUser() (never auth() —
// Clerk v5 sessionClaims do not include publicMetadata) and evaluates it
// against the versioned authority matrix in config/authority.ts.
//
// can(user, permission) is the single check every admin page and nav item
// goes through, even while only the admin role exists — Session 2's gates
// API enforces the same permission keys server-side in fox-underwriting.

import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { normalizeRoles, roleCan, type Permission } from '@/config/authority'

export interface SessionUser {
  userId: string
  email: string
  name: string
  roles: string[]
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const user = await currentUser()
  if (!user) return null
  const metadata = (user.publicMetadata ?? {}) as { roles?: unknown; role?: unknown }
  return {
    userId: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? '',
    name: user.fullName || user.firstName || 'Admin',
    roles: normalizeRoles(metadata),
  }
}

export function can(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false
  return roleCan(user.roles, permission)
}

// Page-level gate: redirects unauthenticated users to sign-in and
// authenticated-but-unauthorized users to the portal dispatcher. Unknown
// roles degrade to no access, never a crash.
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/portal/sign-in')
  if (!can(user, permission)) redirect('/portal')
  return user
}
