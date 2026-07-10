// POST /api/portal/admin/people/offboard (Session 8)
//
// The one-action disable. Gated on people.manage (admin-only baseline),
// two-tap confirmed in the UI. Order:
//   1. Guards: the target exists; you cannot offboard yourself (lockout
//      protection — the last admin stays in).
//   2. Clerk ban + session revoke (lib/people.ts). If the ban fails,
//      nothing else happens and the response says the person is NOT out.
//   3. Build the checklist from what the system knows: roles and grants
//      (authority matrix), partner attribution (Zoho referred files),
//      agent scope (provisioning record + the gates setup_remaining
//      contract), compliance credentials held by them. Unknowns are
//      stated, never hidden.
//   4. Persist the record to FOXCA (people_offboarding). Nothing deletes:
//      audit history, provisioning record, and view-as logs all remain.

import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { apiPermission } from '@/lib/authz'
import { normalizeRoles } from '@/config/authority'
import { banAndRevokeUser } from '@/lib/people'
import { buildOffboardChecklist } from '@/lib/offboarding'
import { listProvisioningRecords, recordOffboarding } from '@/lib/people-store'
import { listCredentials } from '@/lib/compliance'
import { getAllDealsRevenue } from '@/lib/zoho-admin'

export const dynamic = 'force-dynamic'

const PARTNER_META_KEYS = [
  'zoho_partner_id',
  'fp_zoho_id',
  'realtor_zoho_id',
  'lawyer_zoho_id',
  'mortgage_agent_zoho_id',
] as const

export async function POST(req: Request) {
  const gate = await apiPermission('people.manage')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 })
  }
  const clerkUserId = typeof (body as any)?.clerkUserId === 'string' ? (body as any).clerkUserId : ''
  if (!clerkUserId) {
    return NextResponse.json({ error: 'clerkUserId is required.' }, { status: 422 })
  }
  if (clerkUserId === gate.user.userId) {
    return NextResponse.json(
      { error: 'You cannot offboard yourself — that would lock the last admin out.' },
      { status: 400 },
    )
  }

  // Load the target for name/email/roles/metadata before the ban.
  let target: any
  try {
    target = await clerkClient.users.getUser(clerkUserId)
  } catch {
    return NextResponse.json({ error: 'No portal user with that id.' }, { status: 404 })
  }
  const metadata = (target.publicMetadata ?? {}) as Record<string, unknown>
  const roles = normalizeRoles(metadata as { roles?: unknown; role?: unknown })
  const name = [target.firstName, target.lastName].filter(Boolean).join(' ')
  const email: string = target.emailAddresses?.[0]?.emailAddress ?? ''

  // 2. Disable. If this fails, stop — the checklist must not exist for a
  // person who is still in.
  const ban = await banAndRevokeUser(clerkUserId)
  if (!ban.ok) {
    return NextResponse.json({ error: ban.message }, { status: 502 })
  }

  // 3. Gather checklist inputs — each read degrades honestly.
  let zohoPartnerId: string | null = null
  for (const key of PARTNER_META_KEYS) {
    const v = metadata[key]
    if (typeof v === 'string' && v.length > 0) {
      zohoPartnerId = v
      break
    }
  }

  let referredFilesCount: number | null = null
  if (zohoPartnerId) {
    try {
      const deals = await getAllDealsRevenue()
      referredFilesCount = deals.filter(d => d.referralPartnerId === zohoPartnerId).length
    } catch {
      referredFilesCount = null
    }
  }

  const isAgent = roles.includes('agent')
  let workbenchAgentId: string | null = null
  if (isAgent) {
    const records = await listProvisioningRecords()
    if (records.configured && records.ok) {
      const match = records.data.find(r => r.clerk_user_id === clerkUserId)
      workbenchAgentId = match?.workbench_agent_id ?? null
    }
  }

  let credentialsHeld: { id: string; name: string }[] = []
  let credentialsReadable = false
  const creds = await listCredentials()
  if (creds.configured && creds.ok) {
    credentialsReadable = true
    const needleName = name.toLowerCase()
    const needleEmail = email.toLowerCase()
    credentialsHeld = creds.data
      .filter(c => c.status === 'active')
      .filter(c => {
        const holder = (c.holder ?? '').toLowerCase()
        return (
          (needleName && holder.includes(needleName)) ||
          (needleEmail && holder.includes(needleEmail))
        )
      })
      .map(c => ({ id: c.id, name: c.name }))
  }

  const checklist = buildOffboardChecklist({
    name,
    roles,
    zohoPartnerId,
    referredFilesCount,
    isAgent,
    workbenchAgentId,
    credentialsHeld,
    credentialsReadable,
  })

  // 4. Persist.
  const recorded = await recordOffboarding({
    actor: gate.user.email,
    clerkUserId,
    email,
    name,
    roles,
    checklist,
  })
  const offboardId = recorded.configured && recorded.ok ? recorded.data : null
  if (!offboardId) {
    console.error('[people/offboard] FOXCA record did not land')
  }

  return NextResponse.json({
    ok: true,
    offboardId,
    sessionsRevoked: ban.sessionsRevoked,
    checklist,
    recordWarning: offboardId
      ? null
      : 'The person is disabled, but the offboarding record did not land in FOXCA — note the checklist manually.',
  })
}
