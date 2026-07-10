// Directory — staff from the workbench agents table (Session 4). Lender
// contact numbers live in the workbench number directory, which sits
// outside the granted 16-table surface, so this page renders its honest
// scope: staff only, with the gap stated rather than worked around.

import { requirePermission } from '@/lib/authz'
import { getAgents, type UwResult } from '@/lib/underwriting'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

export default async function DirectoryPage() {
  await requirePermission('deals.view')

  const agentsR = await getAgents()
  const agents = val(agentsR) ?? []

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Directory</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Staff on the workbench, with licence numbers for lender paperwork.
        </p>
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Staff</h2>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-400 font-body">
            {agentsR && !agentsR.configured
              ? 'Workbench not connected.'
              : 'No agent rows answered. Reload to retry.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agents.map(a => (
              <div key={a.id} className="border border-gray-100 rounded-lg p-3">
                <p className="text-sm font-body font-semibold text-navy">{a.name}</p>
                <p className="text-xs font-body text-gray-500 mt-0.5">Mortgage Agent Level 2</p>
                <p className="text-xs font-body text-gray-600 mt-1.5">{a.email}</p>
                <p className="text-xs font-body text-gray-500">FSRA licence {a.fsraLicence}</p>
                {a.officePhone && <p className="text-xs font-body text-gray-500">{a.officePhone}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-2">Lender contacts</h2>
        <p className="text-sm text-gray-400 font-body">
          The lender number directory lives in the workbench outside the portal's granted
          read-only surface, so it does not render here yet. When that grant lands, contacts
          appear in this section.
        </p>
      </div>
    </div>
  )
}
