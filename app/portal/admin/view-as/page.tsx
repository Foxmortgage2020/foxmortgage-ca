// View-as picker (Session 8). The governed entry point to the read-only
// partner portal views: pick any partner, open their portal exactly as
// they see it. Gated on portals.view-as (admin-only in the shipped
// baseline). Every session logs to FOXCA (viewer, viewed, started, ended)
// and lists under Audit Log → View-as sessions.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { listAllPartners, type PartnerListItem } from '@/lib/zoho'
import ImpersonateButton from '@/components/ImpersonateButton'

export const dynamic = 'force-dynamic'

type ViewAsRole = 'fp' | 'investor' | 'realtor' | 'lawyer' | 'mortgage_agent'

// Exact Partner_Type → view-as channel. The impersonate route validates
// the exact type, so prospect variants are intentionally absent (a
// prospect has no portal to view).
const VIEW_AS_GROUPS: { zohoType: string; role: ViewAsRole; heading: string }[] = [
  { zohoType: 'Financial Planner', role: 'fp', heading: 'Financial Planners' },
  { zohoType: 'Realtor', role: 'realtor', heading: 'Realtors' },
  { zohoType: 'Lawyer', role: 'lawyer', heading: 'Lawyers' },
  { zohoType: 'Mortgage Agent', role: 'mortgage_agent', heading: 'Mortgage Agents' },
  { zohoType: 'Investor', role: 'investor', heading: 'Investors' },
]

export default async function ViewAsPickerPage() {
  await requirePermission('portals.view-as')

  let partners: PartnerListItem[] = []
  let zohoOk = true
  try {
    partners = await listAllPartners()
  } catch {
    zohoOk = false
  }

  const byType = new Map<string, PartnerListItem[]>()
  for (const p of partners) {
    if (!p.partnerType) continue
    const list = byType.get(p.partnerType) ?? []
    list.push(p)
    byType.set(p.partnerType, list)
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">View as a partner</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Opens that partner&apos;s portal read-only: every action control is removed and the
          server refuses writes for the whole session. A banner names who is being viewed, and
          each session is logged (who, whom, when) under{' '}
          <Link href="/portal/admin/audit/view-as" className="text-navy underline">
            Audit Log → View-as sessions
          </Link>
          .
        </p>
      </div>

      {!zohoOk && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm font-body text-amber-800">
          Could not load the partner list from Zoho right now. Try again in a moment.
        </div>
      )}

      {zohoOk &&
        VIEW_AS_GROUPS.map(group => {
          const rows = (byType.get(group.zohoType) ?? []).sort((a, b) =>
            (a.name ?? '').localeCompare(b.name ?? ''),
          )
          if (rows.length === 0) return null
          return (
            <div key={group.zohoType} className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
              <h2 className="font-heading text-navy font-bold text-base mb-3">
                {group.heading}
                <span className="ml-2 text-xs font-body font-normal text-gray-400">
                  {rows.length}
                </span>
              </h2>
              <ul className="divide-y divide-gray-100">
                {rows.map(p => (
                  <li key={p.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-body text-sm text-navy truncate">{p.name ?? p.id}</p>
                      <p className="font-body text-xs text-gray-400 truncate">
                        {p.email ?? 'no email on file'}
                        {p.partnerStatus ? ` · ${p.partnerStatus}` : ''}
                      </p>
                    </div>
                    <ImpersonateButton partnerId={p.id} role={group.role} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

      {zohoOk && partners.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-body text-gray-500">
          No partner records in Zoho yet.
        </div>
      )}
    </div>
  )
}
