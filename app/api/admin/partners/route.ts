// GET /api/admin/partners?role=<fp|investor|realtor|lawyer>
//
// Admin-only. Backs the PartnerPicker popover. Lists Clerk users whose
// publicMetadata.roles[] matches the requested role AND who have the
// corresponding Zoho id populated (fp_zoho_id for FP, realtor_zoho_id
// for realtor, lawyer_zoho_id for lawyer, zoho_partner_id for investor)
// — so the picker only shows partners that will actually resolve once
// the impersonation cookie is set.
//
// Fetches the full user list from Clerk and filters in memory. At our
// scale (≪ 200 users) this is fine; if user count ever grows we can
// switch to Clerk's metadata-filtered listing.

import { NextResponse } from 'next/server'
import { currentUser, clerkClient } from '@clerk/nextjs/server'

type Role = 'fp' | 'investor' | 'realtor' | 'lawyer'

type Partner = {
  userId: string
  name: string
  firm: string | null
  zohoId: string
  email: string
}

function isRole(value: string): value is Role {
  return (
    value === 'fp' ||
    value === 'investor' ||
    value === 'realtor' ||
    value === 'lawyer'
  )
}

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const metadata = (user.publicMetadata ?? {}) as { roles?: string[] }
  const roles = metadata.roles ?? []
  if (!roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role') ?? ''
  if (!isRole(role)) {
    return NextResponse.json(
      { error: 'BadRequest', message: "role must be 'fp', 'investor', 'realtor', or 'lawyer'." },
      { status: 400 },
    )
  }

  // Role-to-metadata mapping. Each portal role gets its OWN Zoho id
  // field — this prevents an investor row from accidentally surfacing
  // in the realtor picker (and vice-versa) when a single human happens
  // to hold both Clerk roles.
  //   fp       → fp_zoho_id        / fp_name      / fp_firm
  //   realtor  → realtor_zoho_id   / realtor_name / realtor_firm
  //   lawyer   → lawyer_zoho_id    / lawyer_name  / lawyer_firm
  //   investor → zoho_partner_id   / (no display fields — pulled from Clerk)
  const clerkRoleTag = role === 'fp' ? 'financial-planner' : role
  const zohoIdKey =
    role === 'fp' ? 'fp_zoho_id'
    : role === 'realtor' ? 'realtor_zoho_id'
    : role === 'lawyer' ? 'lawyer_zoho_id'
    : 'zoho_partner_id'
  const nameKey =
    role === 'fp' ? 'fp_name'
    : role === 'realtor' ? 'realtor_name'
    : role === 'lawyer' ? 'lawyer_name'
    : null
  const firmKey =
    role === 'fp' ? 'fp_firm'
    : role === 'realtor' ? 'realtor_firm'
    : role === 'lawyer' ? 'lawyer_firm'
    : null

  // Paginate through Clerk users. At our scale a single page is plenty,
  // but the loop guards against future growth.
  const partners: Partner[] = []
  let offset = 0
  const limit = 100
  while (true) {
    const page = await clerkClient.users.getUserList({ limit, offset })
    const list = Array.isArray(page) ? page : page.data
    if (!list || list.length === 0) break

    for (const u of list) {
      const md = (u.publicMetadata ?? {}) as Record<string, unknown>
      // Clerk metadata in this org has three inconsistent shapes that all
      // need to resolve to the same string[]:
      //   1. `roles: ['financial-planner']` (plural array)        — Ben Zavitz
      //   2. `roles: 'investor'`            (plural key, string)  — Dominic Tersigni
      //   3. `role:  'admin'`               (singular key, string) — Mike Fox
      const userRoles: string[] = Array.isArray(md.roles)
        ? (md.roles as string[])
        : typeof md.roles === 'string'
          ? [md.roles as string]
          : typeof md.role === 'string'
            ? [md.role as string]
            : []
      if (!userRoles.includes(clerkRoleTag)) continue

      const zohoId = typeof md[zohoIdKey] === 'string' ? (md[zohoIdKey] as string) : null
      if (!zohoId) continue

      const displayName = nameKey && typeof md[nameKey] === 'string' ? (md[nameKey] as string) : null
      const displayFirm = firmKey && typeof md[firmKey] === 'string' ? (md[firmKey] as string) : null
      const fallbackName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.id
      const email = u.emailAddresses[0]?.emailAddress ?? ''

      partners.push({
        userId: u.id,
        name: displayName || fallbackName,
        firm: displayFirm,
        zohoId,
        email,
      })
    }

    if (list.length < limit) break
    offset += list.length
    if (offset > 1000) break // safety stop
  }

  partners.sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ partners })
}
