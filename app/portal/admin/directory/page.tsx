// Directory — staff from the workbench agents table (Session 4) and the
// learned number directory (Session 6, number_links granted as the 17th
// table by fox-underwriting migration 0028). Numbers are stored as their
// last ten digits and render exactly as stored; linked Zoho contacts and
// partners get their CRM links where the workbench recorded one.

import { requirePermission } from '@/lib/authz'
import {
  getAgents,
  getNumberLinks,
  isPermissionRefusal,
  getAgentIdByEmail,
  type UwResult,
} from '@/lib/underwriting'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { fmtShortDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

// Last-ten digits rendered readably: 226 770 8880. Display formatting
// only; the stored value is the source of truth.
function fmtLast10(digits: string): string {
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return digits
}

export default async function DirectoryPage() {
  await requirePermission('deals.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  const [agentsR, numbersR] = await Promise.all([
    getAgents(),
    agentId ? getNumberLinks(agentId) : Promise.resolve(null),
  ])
  const agents = val(agentsR) ?? []
  const numbers = val(numbersR)

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Directory</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Staff on the workbench, with licence numbers for lender paperwork, and the numbers the
          call triage has learned.
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
        <h2 className="font-heading text-navy font-bold text-base mb-2">Learned numbers</h2>
        {numbers === null ? (
          numbersR && isPermissionRefusal(numbersR) ? (
            <p className="text-sm text-gray-400 font-body">
              The number directory is not granted to the portal read-only role. When the grant
              lands, learned numbers appear in this section.
            </p>
          ) : (
            <p className="text-sm text-gray-400 font-body">
              {agentId
                ? 'The number directory did not answer just now. Reload to retry.'
                : 'Workbench not connected.'}
            </p>
          )
        ) : numbers.length === 0 ? (
          <p className="text-sm text-gray-400 font-body">
            No learned numbers yet. The workbench call triage records a number here the first time
            it links one to a contact or partner.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body min-w-[520px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Number (last 10)</th>
                  <th className="py-2 pr-3 font-medium">Label</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Linked record</th>
                  <th className="py-2 font-medium">Learned</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map(n => (
                  <tr key={n.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3 font-semibold text-navy whitespace-nowrap">
                      {fmtLast10(n.phoneLast10)}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{n.label ?? ''}</td>
                    <td className="py-2 pr-3 text-gray-500">{n.source ?? ''}</td>
                    <td className="py-2 pr-3">
                      {n.zohoContactId ? (
                        <a
                          href={`https://crm.zoho.com/crm/org906105026/tab/Contacts/${n.zohoContactId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-navy underline hover:text-lime text-xs font-semibold"
                        >
                          Zoho contact
                        </a>
                      ) : n.zohoPartnerId ? (
                        <a
                          href={`https://crm.zoho.com/crm/org906105026/tab/Vendors/${n.zohoPartnerId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-navy underline hover:text-lime text-xs font-semibold"
                        >
                          Zoho partner
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">not linked</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{fmtShortDate(n.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400 font-body mt-3">
          The workbench stores the last ten digits only; this page renders them exactly as stored.
        </p>
      </div>
    </div>
  )
}
