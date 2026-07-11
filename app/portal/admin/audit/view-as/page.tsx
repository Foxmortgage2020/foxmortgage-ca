// View-as session log (Session 8). Every governed view-as session —
// viewer, viewed partner, portal, started, ended — from the FOXCA
// view_as_sessions table (narrow function surface, nothing deletes).
// Sessions the browser never explicitly exited (tab closed, cookie
// expired with the browser) show as expired once stale.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import DemoNotAvailable from '@/components/admin/DemoNotAvailable'
import { viewAsList, type ViewAsSession } from '@/lib/people-store'

export const dynamic = 'force-dynamic'

// A view-as cookie dies with the browser session; a log row still open
// after this many hours is treated as expired rather than active.
const STALE_AFTER_HOURS = 12

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

function sessionState(s: ViewAsSession): { label: string; cls: string } {
  if (s.ended_at) return { label: 'ended', cls: 'bg-gray-100 text-gray-600' }
  const ageMs = Date.now() - new Date(s.started_at).getTime()
  if (ageMs > STALE_AFTER_HOURS * 3600_000) {
    return { label: 'expired', cls: 'bg-amber-50 text-amber-700' }
  }
  return { label: 'active', cls: 'bg-lime/20 text-navy' }
}

const ROLE_LABELS: Record<string, string> = {
  fp: 'Financial Planner',
  investor: 'Investor',
  realtor: 'Realtor',
  lawyer: 'Lawyer',
  mortgage_agent: 'Mortgage Agent',
}

export default async function ViewAsLogPage() {
  await requirePermission('audit.view')
  if (isDemoMode()) return <DemoNotAvailable surface="View-as sessions" />


  const res = await viewAsList(200)

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">View-as sessions</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Who opened whose portal, and when. Sessions are logged when they start and stamped
          when they end; a session closed by shutting the browser shows as expired. Rows are
          never deleted.{' '}
          <Link href="/portal/admin/audit" className="text-navy underline hover:text-lime">
            Back to the audit log
          </Link>
          .
        </p>
      </div>

      <div className="mt-5">
        {!res.configured ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500 font-body">
            The FOXCA store is not connected (FOXCA_SUPABASE_URL / FOXCA_SUPABASE_KEY), so
            view-as sessions are not being recorded.
          </div>
        ) : !res.ok ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800 font-body">
            Could not read the view-as log right now: {res.error}
          </div>
        ) : res.data.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500 font-body">
            No view-as sessions recorded yet. Sessions land here the moment someone opens a
            partner portal through the picker.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm font-body min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2.5 px-4 font-medium">Viewer</th>
                  <th className="py-2.5 px-4 font-medium">Viewed</th>
                  <th className="py-2.5 px-4 font-medium">Portal</th>
                  <th className="py-2.5 px-4 font-medium">Started</th>
                  <th className="py-2.5 px-4 font-medium">Ended</th>
                  <th className="py-2.5 px-4 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {res.data.map(s => {
                  const state = sessionState(s)
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 px-4 text-navy">{s.viewer_email}</td>
                      <td className="py-2.5 px-4">{s.partner_name}</td>
                      <td className="py-2.5 px-4 text-gray-500">
                        {ROLE_LABELS[s.portal_role] ?? s.portal_role}
                      </td>
                      <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap">
                        {fmtToronto(s.started_at)}
                      </td>
                      <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap">
                        {s.ended_at ? fmtToronto(s.ended_at) : '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${state.cls}`}>
                          {state.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
