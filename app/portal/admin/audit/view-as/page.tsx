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
import StatusChip, { type ChipTone } from '@/components/admin/ds/StatusChip'

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

function sessionState(s: ViewAsSession): { label: string; tone: ChipTone } {
  if (s.ended_at) return { label: 'ended', tone: 'gray' }
  const ageMs = Date.now() - new Date(s.started_at).getTime()
  if (ageMs > STALE_AFTER_HOURS * 3600_000) {
    return { label: 'expired', tone: 'amber' }
  }
  return { label: 'active', tone: 'green' }
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
        <p className="text-cool-500 font-ui text-sm mt-1">
          Who opened whose portal, and when. Sessions are logged when they start and stamped
          when they end; a session closed by shutting the browser shows as expired. Rows are
          never deleted.{' '}
          <Link href="/portal/admin/audit" className="text-navy underline hover:text-ink">
            Back to the audit log
          </Link>
          .
        </p>
      </div>

      <div className="mt-5">
        {!res.configured ? (
          <div className="bg-white border border-cool-200 rounded-[9px] p-5 text-sm text-cool-500 font-ui">
            The FOXCA store is not connected (FOXCA_SUPABASE_URL / FOXCA_SUPABASE_KEY), so
            view-as sessions are not being recorded.
          </div>
        ) : !res.ok ? (
          <div className="bg-amber-50 border border-amber-200 rounded-[9px] p-5 text-sm text-amber-800 font-ui">
            Could not read the view-as log right now: {res.error}
          </div>
        ) : res.data.length === 0 ? (
          <div className="bg-white border border-cool-200 rounded-[9px] p-5 text-sm text-cool-500 font-ui">
            No view-as sessions recorded yet. Sessions land here the moment someone opens a
            partner portal through the picker.
          </div>
        ) : (
          <div className="bg-white border border-cool-200 rounded-[9px] overflow-x-auto">
            <table className="w-full text-sm font-ui min-w-[640px]">
              <thead>
                <tr className="text-left font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600">
                  <th className="py-2.5 px-4 font-semibold">Viewer</th>
                  <th className="py-2.5 px-4 font-semibold">Viewed</th>
                  <th className="py-2.5 px-4 font-semibold">Portal</th>
                  <th className="py-2.5 px-4 font-semibold">Started</th>
                  <th className="py-2.5 px-4 font-semibold">Ended</th>
                  <th className="py-2.5 px-4 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {res.data.map(s => {
                  const state = sessionState(s)
                  return (
                    <tr key={s.id} className="border-t border-cool-100">
                      <td className="py-2.5 px-4 text-navy">{s.viewer_email}</td>
                      <td className="py-2.5 px-4">{s.partner_name}</td>
                      <td className="py-2.5 px-4 text-cool-500">
                        {ROLE_LABELS[s.portal_role] ?? s.portal_role}
                      </td>
                      <td className="py-2.5 px-4 text-cool-500 whitespace-nowrap tabular-nums">
                        {fmtToronto(s.started_at)}
                      </td>
                      <td className="py-2.5 px-4 text-cool-500 whitespace-nowrap tabular-nums">
                        {s.ended_at ? fmtToronto(s.ended_at) : '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusChip tone={state.tone}>{state.label}</StatusChip>
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
