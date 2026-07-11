// Clerk backend operations for the people surface (Session 8).
// Server-only — CLERK_SECRET_KEY never leaves the server; routes gate on
// people.manage before calling anything here. Three operations exist:
// list everyone with access, create a provisioned user, and
// ban-and-revoke (offboarding). Deleting users is deliberately NOT in
// this module: offboarding disables, history remains.

import { clerkClient } from '@clerk/nextjs/server'
import { normalizeRoles } from '@/config/authority'
// Session 9: provisioning + offboarding are hard-blocked in demo mode so a
// demo can never create or ban a real Clerk user.
import { isDemoMode } from '@/lib/demo'

export interface PersonRow {
  clerkUserId: string
  name: string
  email: string
  roles: string[]
  lastSignInAt: number | null
  createdAt: number | null
  banned: boolean
}

// Paginate through every Clerk user. The loop guards against growth; the
// 1,000 cap is far above any realistic head count for this practice.
export async function listClerkPeople(): Promise<PersonRow[]> {
  const people: PersonRow[] = []
  let offset = 0
  const limit = 100
  while (true) {
    const page: any = await clerkClient.users.getUserList({ limit, offset })
    const list: any[] = Array.isArray(page) ? page : (page?.data ?? [])
    if (!list.length) break
    for (const u of list) {
      const md = (u.publicMetadata ?? {}) as { roles?: unknown; role?: unknown }
      people.push({
        clerkUserId: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' '),
        email: u.emailAddresses?.[0]?.emailAddress ?? '',
        roles: normalizeRoles(md),
        lastSignInAt: typeof u.lastSignInAt === 'number' ? u.lastSignInAt : null,
        createdAt: typeof u.createdAt === 'number' ? u.createdAt : null,
        banned: Boolean(u.banned),
      })
    }
    if (list.length < limit) break
    offset += limit
    if (offset >= 1000) break
  }
  return people
}

export type CreateUserResult =
  | { ok: true; clerkUserId: string }
  | { ok: false; status: 409 | 502; message: string }

// Creates the Clerk user with roles stamped in publicMetadata. No
// password is set — the person signs in through the invitation email's
// set-password flow. Error copy is sanitized; raw Clerk bodies never
// reach the client.
export async function createProvisionedUser(input: {
  email: string
  firstName: string
  lastName: string
  publicMetadata: Record<string, unknown>
}): Promise<CreateUserResult> {
  if (isDemoMode()) return { ok: false, status: 502, message: 'Provisioning is disabled in demo mode.' }
  try {
    const created: any = await clerkClient.users.createUser({
      emailAddress: [input.email],
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
      publicMetadata: input.publicMetadata,
      skipPasswordRequirement: true,
    } as any)
    return { ok: true, clerkUserId: created.id }
  } catch (err: any) {
    const first = err?.errors?.[0] as { code?: string; message?: string } | undefined
    if (first?.code === 'form_identifier_exists') {
      return { ok: false, status: 409, message: 'A portal user with this email already exists.' }
    }
    console.error('[people] createUser failed', first?.code ?? 'unknown')
    return {
      ok: false,
      status: 502,
      message: first?.message || 'Clerk could not create the user. Try again.',
    }
  }
}

export type BanResult =
  | { ok: true; sessionsRevoked: number }
  | { ok: false; message: string }

// The one-action disable: ban the user (blocks every future sign-in),
// then revoke every live session so they are out immediately, not at
// token expiry. If the ban itself fails we report failure — the person
// is NOT out and the checklist must not pretend otherwise. A partial
// session sweep after a successful ban still counts as disabled (banned
// users cannot refresh their sessions).
export async function banAndRevokeUser(userId: string): Promise<BanResult> {
  if (isDemoMode()) return { ok: false, message: 'Offboarding is disabled in demo mode.' }
  try {
    await clerkClient.users.banUser(userId)
  } catch (err: any) {
    console.error('[people] banUser failed', err?.errors?.[0]?.code ?? 'unknown')
    return { ok: false, message: 'Clerk refused the ban. The user has NOT been disabled.' }
  }
  let revoked = 0
  try {
    const res: any = await clerkClient.sessions.getSessionList({ userId })
    const sessions: any[] = Array.isArray(res) ? res : (res?.data ?? [])
    for (const s of sessions) {
      if (s.status !== 'active') continue
      try {
        await clerkClient.sessions.revokeSession(s.id)
        revoked++
      } catch {
        console.error('[people] revokeSession failed for one session (user stays banned)')
      }
    }
  } catch {
    console.error('[people] session list failed after ban (user stays banned)')
  }
  return { ok: true, sessionsRevoked: revoked }
}
