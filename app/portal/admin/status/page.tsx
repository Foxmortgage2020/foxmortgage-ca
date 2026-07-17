// Status: one screen that answers "is the machine healthy". Every panel is
// a real check or an explicit not-configured state; green is reserved for
// genuinely healthy. Data loads fresh on each page load; no auto refresh.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { INTAKE_STALE_HOURS, WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  formIntakeLight,
  getBookkeepingStatus,
  getDeployInfo,
  getFormIntakeFailures,
  getFormIntakeStatus,
  getN8nStatus,
} from '@/lib/status'
import FormIntakeAck from '@/components/admin/FormIntakeAck'
import StatusChip, { type ChipTone } from '@/components/admin/ds/StatusChip'
import { can, getSessionUser } from '@/lib/authz'
import {
  getAgentIdByEmail,
  getIntakeFreshness,
  workbenchConfigured,
} from '@/lib/underwriting'
import { getGatesHealth } from '@/lib/gates'
import { zohoPing } from '@/lib/zoho-admin'
import { fmtDateTime, hoursSince } from '@/lib/dates'

export const dynamic = 'force-dynamic'

type Light = 'ok' | 'warn' | 'fail' | 'off'

function Dot({ light }: { light: Light }) {
  const cls = {
    ok: 'bg-green-500',
    warn: 'bg-amber-500',
    fail: 'bg-red-500',
    off: 'bg-cool-300',
  }[light]
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} />
}

const LIGHT_LABEL: Record<Light, string> = {
  ok: 'Healthy',
  warn: 'Needs a look',
  fail: 'Failing',
  off: 'Not configured',
}

// Health semantics map straight onto the chip tones: green stays green,
// amber stays amber, red stays red; not-configured is neutral gray.
const LIGHT_TONE: Record<Light, ChipTone> = {
  ok: 'green',
  warn: 'amber',
  fail: 'red',
  off: 'gray',
}

function Panel({
  light,
  title,
  children,
}: {
  light: Light
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-cool-200 rounded-[9px] p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <Dot light={light} />
        <h2 className="font-heading text-navy font-bold text-base flex-1">{title}</h2>
        <StatusChip tone={LIGHT_TONE[light]}>{LIGHT_LABEL[light]}</StatusChip>
      </div>
      <div className="text-sm font-ui text-cool-600 space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-cool-500">{label}</span>
      <span className="text-navy font-medium text-right tabular-nums">{value}</span>
    </div>
  )
}

export default async function StatusPage() {
  await requirePermission('status.view')

  const wbConfigured = workbenchConfigured()
  const [agentRes, zoho, n8n, bookkeeping, gates, formIntake] = await Promise.all([
    wbConfigured ? getAgentIdByEmail(WORKBENCH_AGENT_EMAIL) : Promise.resolve(null),
    zohoPing(),
    getN8nStatus(),
    getBookkeepingStatus(),
    getGatesHealth(),
    getFormIntakeStatus(),
  ])
  const agentId = agentRes && agentRes.configured && agentRes.ok ? agentRes.data : null
  const freshRes = agentId ? await getIntakeFreshness(agentId) : null
  const fresh = freshRes && freshRes.configured && freshRes.ok ? freshRes.data : null
  const deploy = getDeployInfo()

  // Workbench light
  let wbLight: Light = 'off'
  let staleHours: number | null = null
  if (wbConfigured) {
    if (!agentId) wbLight = 'fail'
    else if (!fresh) wbLight = 'warn'
    else {
      staleHours = fresh.lastActivity ? hoursSince(fresh.lastActivity) : null
      wbLight = staleHours !== null && staleHours <= INTAKE_STALE_HOURS ? 'ok' : 'warn'
    }
  }

  // Zoho light
  const zohoLight: Light = zoho.ok ? 'ok' : 'fail'

  // n8n light
  let n8nLight: Light = 'off'
  if (n8n.configured) {
    const anyUnreachable = n8n.rows.some(r => r.error)
    const activeErrored = n8n.rows.some(r => r.active && r.lastExecStatus === 'error')
    n8nLight = activeErrored ? 'fail' : anyUnreachable ? 'warn' : 'ok'
  }

  // Bookkeeping light
  let bkLight: Light = 'off'
  if (bookkeeping.n8nConfigured) {
    if (bookkeeping.error) bkLight = 'warn'
    else if (bookkeeping.lastExecStatus === 'error') bkLight = 'fail'
    else if (bookkeeping.writeToQbo === true) bkLight = 'warn'
    else bkLight = 'ok'
  }

  const deployLight: Light = deploy.sha ? 'ok' : 'off'

  // Gates API light. knowledge_bundled of 0 means the knowledge files
  // failed to ride the deploy: amber even when everything else is green.
  let gatesLight: Light = 'off'
  if (gates.configured) {
    if (!gates.reachable) gatesLight = 'fail'
    else if (!gates.ok || gates.knowledgeBundled === 0) gatesLight = 'warn'
    else gatesLight = 'ok'
  }

  // Form intake light (pure, unit-tested): only unacknowledged failures
  // amber the panel.
  const formLight: Light = formIntakeLight(formIntake)
  const formFailures =
    formLight === 'warn' && (formIntake.zohoFailed ?? 0) > 0 ? await getFormIntakeFailures() : []
  const sessionUser = await getSessionUser()
  const canAcknowledge = can(sessionUser, 'status.acknowledge')

  const checkedAt = fmtDateTime(new Date().toISOString())

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Status</h1>
        <p className="text-cool-500 font-ui text-sm mt-1 tabular-nums">
          Checked {checkedAt} &middot; reload the page to re-check; there is no auto refresh
        </p>
      </div>

      <div className="space-y-4">
        {/* Workbench */}
        <Panel light={wbLight} title="Underwriting workbench">
          {!wbConfigured ? (
            <p>
              Not connected. Set UW_SUPABASE_URL, UW_SUPABASE_READONLY_KEY, and
              UW_SUPABASE_PUBLISHABLE_KEY in Vercel to wire this portal to the
              fox-underwriting project through the database-enforced read-only role.
            </p>
          ) : !agentId ? (
            <p className="text-red-700">
              Env vars are present but the workbench is not answering:{' '}
              {agentRes && agentRes.configured && !agentRes.ok ? agentRes.error : 'unknown error'}.
              If this persists, the portal_readonly token may have been rotated; see the
              rotation procedure in fox-underwriting docs/gates-api.md.
            </p>
          ) : (
            <>
              <Row label="Project" value="Reachable through portal_readonly (SELECT on 16 tables)" />
              <Row
                label="Last intake activity"
                value={
                  fresh?.lastActivity
                    ? `${fmtDateTime(fresh.lastActivity)} (${Math.round(staleHours ?? 0)}h ago)`
                    : 'none recorded'
                }
              />
              <Row label="Freshness threshold" value={`${INTAKE_STALE_HOURS}h`} />
            </>
          )}
        </Panel>

        {/* Gates API */}
        <Panel light={gatesLight} title="Gates API">
          {!gates.configured ? (
            <p>
              Not connected. Set GATES_API_URL in Vercel to enable approval decisions from the
              portal.
            </p>
          ) : !gates.reachable ? (
            <p className="text-red-700">
              Unreachable. Approval decisions will fail until the fox-underwriting deployment
              answers; the CLI remains available.
            </p>
          ) : (
            <>
              <Row
                label="Health"
                value={gates.ok ? 'OK' : <span className="text-amber-700 font-semibold">degraded</span>}
              />
              <Row
                label="Auth / DB configured"
                value={`${gates.authConfigured ? 'yes' : 'no'} / ${gates.dbConfigured ? 'yes' : 'no'}${
                  gates.dbReachable === false ? ' (db unreachable)' : ''
                }`}
              />
              <Row
                label="Knowledge files bundled"
                value={
                  gates.knowledgeBundled === null ? (
                    'not reported'
                  ) : gates.knowledgeBundled === 0 ? (
                    <span className="text-amber-700 font-bold">0 (knowledge missed the deploy)</span>
                  ) : (
                    gates.knowledgeBundled
                  )
                }
              />
              <Row label="Commit" value={gates.commit ? gates.commit.slice(0, 7) : 'unknown'} />
              <Row label="Environment" value={gates.env ?? 'unknown'} />
              {gates.error && <p className="text-amber-700">{gates.error}</p>}
            </>
          )}
        </Panel>

        {/* Zoho */}
        <Panel light={zohoLight} title="Zoho CRM">
          {zoho.ok ? (
            <>
              <Row label="Token refresh and authenticated read" value={`OK in ${zoho.ms}ms`} />
              <Row label="Probe" value="1-record read on the Potentials module" />
            </>
          ) : (
            <p className="text-red-700">
              Unreachable: {zoho.error ?? 'unknown error'}. Portal pages that read Zoho will show
              unavailable states until this recovers.
            </p>
          )}
        </Panel>

        {/* n8n */}
        <Panel light={n8nLight} title="n8n workflows">
          {!n8n.configured ? (
            <p>
              Not configured. Set N8N_API_URL and N8N_API_KEY in Vercel to list workflow health
              here.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs font-ui min-w-[520px]">
                <thead>
                  <tr className="text-left font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600">
                    <th className="py-1.5 px-1 font-semibold">Workflow</th>
                    <th className="py-1.5 px-1 font-semibold">Area</th>
                    <th className="py-1.5 px-1 font-semibold">Active</th>
                    <th className="py-1.5 px-1 font-semibold">Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {n8n.rows.map(r => (
                    <tr key={r.id} className="border-t border-cool-100">
                      <td className="py-1.5 px-1 text-navy">{r.name}</td>
                      <td className="py-1.5 px-1 text-cool-500">{r.area}</td>
                      <td className="py-1.5 px-1">
                        {r.error ? (
                          <span className="text-red-600">{r.error}</span>
                        ) : r.active ? (
                          <span className="text-green-700 font-semibold">yes</span>
                        ) : (
                          <span className="text-cool-400">no</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1 tabular-nums">
                        {r.lastExecStatus ? (
                          <span
                            className={
                              r.lastExecStatus === 'error' ? 'text-red-600 font-semibold' : 'text-cool-600'
                            }
                          >
                            {r.lastExecStatus} {r.lastExecAt ? `at ${fmtDateTime(r.lastExecAt)}` : ''}
                          </span>
                        ) : (
                          <span className="text-cool-400">none recorded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Bookkeeping */}
        <Panel light={bkLight} title="Bookkeeping pipeline">
          <Row
            label="WRITE_TO_QBO"
            value={
              bookkeeping.writeToQbo === null ? (
                bookkeeping.n8nConfigured ? (
                  'unavailable'
                ) : (
                  'needs N8N_API_URL and N8N_API_KEY'
                )
              ) : bookkeeping.writeToQbo ? (
                <span className="text-amber-700 font-bold">true (LIVE writes)</span>
              ) : (
                <span className="text-green-700 font-bold">false (dry-run mode)</span>
              )
            }
          />
          {bookkeeping.realmId && (
            <Row
              label="QBO realm"
              value={
                bookkeeping.realmId === '9341456901231490' ? (
                  `${bookkeeping.realmId} (sandbox)`
                ) : (
                  <span className="text-red-700 font-semibold">
                    {bookkeeping.realmId} (PRODUCTION)
                  </span>
                )
              }
            />
          )}
          {bookkeeping.workflowActive !== null && (
            <Row label="Nightly workflow" value={bookkeeping.workflowActive ? 'active' : 'inactive'} />
          )}
          {bookkeeping.lastExecStatus && (
            <Row
              label="Last nightly run"
              value={
                <span className={bookkeeping.lastExecStatus === 'error' ? 'text-red-600 font-semibold' : ''}>
                  {bookkeeping.lastExecStatus}
                  {bookkeeping.lastExecAt ? ` at ${fmtDateTime(bookkeeping.lastExecAt)}` : ''}
                </span>
              }
            />
          )}
          {bookkeeping.error && <p className="text-amber-700">{bookkeeping.error}</p>}
          <div className="pt-2 border-t border-cool-100 mt-2">
            <p className="text-cool-500 mb-1">
              Recent dry-run log entries (in-memory; resets on deploy or idle):
            </p>
            {bookkeeping.dryRunEntries.length === 0 ? (
              <p className="text-cool-400">none on this server instance</p>
            ) : (
              bookkeeping.dryRunEntries.map((e, i) => (
                <p key={i} className="text-xs text-cool-600 tabular-nums">
                  {fmtDateTime(e.timestamp)}: {e.vendor_name || e.transaction_id} ({e.match_method},
                  confidence {e.confidence})
                </p>
              ))
            )}
          </div>
        </Panel>

        {/* Form intake capture */}
        <Panel light={formLight} title="Form intake capture">
          {!formIntake.configured ? (
            <p>
              Not connected. Set FOXCA_SUPABASE_URL and FOXCA_SUPABASE_KEY in Vercel to monitor
              the form_submissions capture table.
            </p>
          ) : !formIntake.reachable ? (
            <p className="text-red-700">
              The foxmortgage-ca Supabase project is unreachable. Public form submissions fall
              back to Zoho-only until it recovers.
            </p>
          ) : formIntake.error ? (
            <p className="text-amber-700">Reachable, but {formIntake.error}.</p>
          ) : (
            <>
              <Row label="Submissions in the last 7 days" value={formIntake.total7d ?? 'unknown'} />
              <Row
                label="Unacknowledged zoho_failed"
                value={
                  (formIntake.zohoFailed ?? 0) > 0 ? (
                    <span className="text-amber-700 font-bold">
                      {formIntake.zohoFailed} (rows captured, Zoho lead missing)
                    </span>
                  ) : (
                    '0'
                  )
                }
              />
              {(formIntake.zohoFailedTotal ?? 0) > (formIntake.zohoFailed ?? 0) && (
                <Row
                  label="Acknowledged failure history"
                  value={`${(formIntake.zohoFailedTotal ?? 0) - (formIntake.zohoFailed ?? 0)} row(s), triaged`}
                />
              )}
              <Row
                label="Latest submission"
                value={formIntake.latestAt ? fmtDateTime(formIntake.latestAt) : 'none recorded'}
              />
              {canAcknowledge && <FormIntakeAck failures={formFailures} />}
            </>
          )}
        </Panel>

        {/* Deploy */}
        <Panel light={deployLight} title="Deploy">
          {deploy.sha ? (
            <>
              <Row label="Commit" value={`${deploy.sha.slice(0, 7)} on ${deploy.ref ?? '?'}`} />
              {deploy.message && (
                <Row label="Message" value={deploy.message.length > 60 ? deploy.message.slice(0, 60) + '...' : deploy.message} />
              )}
              <Row label="Built" value={deploy.buildTime ? fmtDateTime(deploy.buildTime) : 'unknown'} />
              <Row label="Environment" value={`${deploy.env ?? '?'}${deploy.region ? `, ${deploy.region}` : ''}`} />
            </>
          ) : (
            <p>
              Local development server. Deploy details (commit, build time) populate on Vercel.
              {deploy.buildTime ? ` Built ${fmtDateTime(deploy.buildTime)}` : ''}
            </p>
          )}
        </Panel>
      </div>

      <p className="text-xs text-cool-500 font-ui mt-6">
        Missing a panel you expected? The <Link href="/portal/admin/roadmap" className="underline hover:text-navy">Roadmap</Link>{' '}
        lists what arrives in each session.
      </p>
    </div>
  )
}
