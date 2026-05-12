// GET /api/admin/partners?role=<fp|investor|realtor>
//
// Admin-only. Backs the PartnerPicker popover. Lists Clerk users whose
// publicMetadata.roles[] matches the requested role AND who have the
// corresponding Zoho id populated (fp_zoho_id for FP, zoho_partner_id
// for investor/realtor) — so the picker only shows partners that
// will actually resolve once the impersonation cookie is set.
//
// Fetches the full user list from Clerk and filters in memory. At our
// scale (≪ 200 users) this is fine; if user count ever grows we can
// switch to Clerk's metadata-filtered listing.

import { NextResponse } from 'next/server'
import { currentUser, clerkClient } from '@clerk/nextjs/server'

type Role = 'fp' | 'investor' | 'realtor'

type Partner = {
  userId: string
  name: string
  firm: string | null
  zohoId: string
  email: string
}

function isRole(value: string): value is Role {
  return value === 'fp' || value === 'investor' || value === 'realtor'
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
      { error: 'BadRequest', message: "role must be 'fp', 'investor', or 'realtor'." },
      { status: 400 },
    )
  }

  // Role-to-metadata mapping. fp lives in publicMetadata.fp_zoho_id;
  // investor and realtor share the publicMetadata.zoho_partner_id field
  // (they're differentiated by which Clerk role they hold).
  const clerkRoleTag = role === 'fp' ? 'financial-planner' : role
  const zohoIdKey = role === 'fp' ? 'fp_zoho_id' : 'zoho_partner_id'

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
      const userRoles = Array.isArray(md.roles) ? (md.roles as string[]) : []
      if (!userRoles.includes(clerkRoleTag)) continue

      const zohoId = typeof md[zohoIdKey] === 'string' ? (md[zohoIdKey] as string) : null
      if (!zohoId) continue

      const fpName = typeof md.fp_name === 'string' ? (md.fp_name as string) : null
      const fpFirm = typeof md.fp_firm === 'string' ? (md.fp_firm as string) : null
      const fallbackName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.id
      const email = u.emailAddresses[0]?.emailAddress ?? ''

      partners.push({
        userId: u.id,
        name: fpName || fallbackName,
        firm: fpFirm,
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
