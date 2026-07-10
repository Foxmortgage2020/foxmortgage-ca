// People (Session 8): everyone with portal access — roles, last sign-in
// (server-side Clerk read), provisioned-by (FOXCA), status — and where
// offboarding starts. Gated on people.manage (admin-only baseline).

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { listClerkPeople, type PersonRow } from '@/lib/people'
import {
  listOffboardingRecords,
  listProvisioningRecords,
  peopleStoreConfigured,
} from '@/lib/people-store'
import PeopleList, { type PersonRowView } from '@/components/admin/PeopleList'

export const dynamic = 'force-dynamic'

export default async function PeoplePage() {
  const user = await requirePermission('people.manage')

  let people: PersonRow[] = []
  let clerkOk = true
  try {
    people = await listClerkPeople()
  } catch {
    clerkOk = false
  }

  const [provRes, offRes] = await Promise.all([
    listProvisioningRecords(),
    listOffboardingRecords(),
  ])
  const provisioning = provRes.configured && provRes.ok ? provRes.data : []
  const offboarding = offRes.configured && offRes.ok ? offRes.data : []

  const provisionByClerkId = new Map<string, (typeof provisioning)[number]>()
  for (const r of provisioning) {
    // Records list newest-first; keep the newest per user.
    if (!provisionByClerkId.has(r.clerk_user_id)) provisionByClerkId.set(r.clerk_user_id, r)
  }
  const offboardByClerkId = new Map<string, string>()
  for (const r of offboarding) {
    if (!offboardByClerkId.has(r.clerk_user_id)) offboardByClerkId.set(r.clerk_user_id, r.id)
  }

  const rows: PersonRowView[] = people.map(p => {
    const prov = provisionByClerkId.get(p.clerkUserId)
    return {
      clerkUserId: p.clerkUserId,
      name: p.name,
      email: p.email,
      roles: p.roles,
      lastSignInAt: p.lastSignInAt,
      banned: p.banned,
      provisionedBy: prov?.provisioned_by ?? null,
      provisionedAt: prov?.created_at ?? null,
      personType: prov?.person_type ?? null,
      offboardId: offboardByClerkId.get(p.clerkUserId) ?? null,
    }
  })

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-navy text-2xl font-bold">People</h1>
          <p className="text-gray-500 font-body text-sm mt-1">
            Everyone with portal access. Provisioning and offboarding both live here; both are
            recorded (who did what to whom, when) and nothing deletes.
          </p>
        </div>
        <Link
          href="/portal/admin/settings/people/new"
          className="bg-lime text-navy font-heading font-bold text-sm px-4 py-2 rounded-lg hover:bg-lime-dark transition-colors"
          data-testid="provision-new"
        >
          Provision someone
        </Link>
      </div>

      {!peopleStoreConfigured() && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm font-body text-amber-800">
          The FOXCA store is not connected, so provisioned-by and offboarding records cannot be
          read or written right now.
        </div>
      )}

      {!clerkOk ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm font-body text-amber-800">
          Could not read the user list from Clerk right now. Try again in a moment.
        </div>
      ) : (
        <PeopleList rows={rows} currentUserId={user.userId} />
      )}
    </div>
  )
}
