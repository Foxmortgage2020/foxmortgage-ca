// Offboarding record (Session 8): the persisted FOXCA checklist for one
// offboarded person — who offboarded whom, when, and what remains to be
// cleaned up. Items toggle; the record never deletes.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import DemoNotAvailable from '@/components/admin/DemoNotAvailable'
import { getOffboardingRecord } from '@/lib/people-store'
import OffboardChecklist from '@/components/admin/OffboardChecklist'

export const dynamic = 'force-dynamic'

function fmtToronto(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default async function OffboardRecordPage({ params }: { params: { id: string } }) {
  await requirePermission('people.manage')
  if (isDemoMode()) return <DemoNotAvailable surface="Offboarding records" />


  const res = await getOffboardingRecord(params.id)
  const record = res.configured && res.ok ? res.data : null

  if (!record) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-heading text-navy text-2xl font-bold">Offboarding record</h1>
        <p className="text-cool-500 font-ui text-sm mt-2">
          {!res.configured
            ? 'The FOXCA store is not connected, so offboarding records cannot be read.'
            : 'No offboarding record with that id.'}{' '}
          <Link href="/portal/admin/settings/people" className="text-navy underline">
            Back to People
          </Link>
        </p>
      </div>
    )
  }

  const done = record.checklist.filter(i => i.done).length

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">
          Offboarding: {record.name || record.email}
        </h1>
        <p className="text-cool-500 font-ui text-sm mt-1">
          Disabled by {record.offboarded_by} on {fmtToronto(record.created_at)} · roles at the
          time: {record.roles.length > 0 ? record.roles.join(', ') : 'none'} · {done}/
          {record.checklist.length} items done.{' '}
          <Link href="/portal/admin/settings/people" className="text-navy underline hover:text-ink">
            Back to People
          </Link>
        </p>
      </div>

      <OffboardChecklist recordId={record.id} items={record.checklist} />

      <p className="mt-4 text-xs text-cool-500 font-ui">
        This record is permanent. The person&apos;s audit history, provisioning record, and
        view-as logs remain readable — that is the point of having them.
        {record.updated_by ? ` Last updated by ${record.updated_by}.` : ''}
      </p>
    </div>
  )
}
