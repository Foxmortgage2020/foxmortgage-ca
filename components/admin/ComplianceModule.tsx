'use client'

// The Compliance module UI (Session 6): dashboard, credential register,
// complaint and incident register, and the policy library with
// acknowledgments. Tab state lives in the URL (?tab=) so every view is
// reachable without a pointer event. Records never delete: credentials
// retire, complaints change status, policies version; every record's
// change history is one fetch away (compliance_events).

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  CREDENTIAL_AMBER_DAYS,
  CREDENTIAL_RED_DAYS,
  WORKBENCH_GAP_FIELDS,
  credentialTone,
  daysUntil,
  type CredentialTone,
} from '@/lib/compliance-logic'
import type {
  ComplianceComplaint,
  ComplianceCredential,
  ComplianceEvent,
  CompliancePolicy,
  CompliancePolicyAck,
} from '@/lib/compliance'
import type { ComplianceAttentionDeal } from '@/lib/underwriting'
import StatusChip, { type ChipTone } from '@/components/admin/ds/StatusChip'

const TABS = ['dashboard', 'credentials', 'register', 'policies'] as const
type Tab = (typeof TABS)[number]

export interface ComplianceInitial {
  credentials: ComplianceCredential[]
  complaints: ComplianceComplaint[]
  policies: CompliancePolicy[]
  acks: CompliancePolicyAck[]
  attentionDeals: ComplianceAttentionDeal[]
  storeConfigured: boolean
  storeError: string | null
  workbenchOk: boolean
}

const TONE_CHIP: Record<CredentialTone, ChipTone> = {
  red: 'red',
  amber: 'amber',
  ok: 'green',
  'no-date': 'gray',
}

// The four semantic tones are the design system's StatusChip; navy is this
// module's one extension (a reported complaint is with the regulator, a
// distinct state rather than a good/bad tone).
function Chip({ tone, children }: { tone: ChipTone | 'navy'; children: React.ReactNode }) {
  if (tone === 'navy') {
    return (
      <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-navy/10 text-navy">
        {children}
      </span>
    )
  }
  return <StatusChip tone={tone}>{children}</StatusChip>
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const inputCls =
  'w-full border border-cool-200 rounded-lg px-2.5 py-2 text-sm font-ui bg-white focus:outline-none focus:border-navy/50'
const btnPrimary =
  'min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold font-ui bg-navy text-white hover:bg-navy/90 disabled:opacity-50'
const btnQuiet =
  'min-h-[40px] px-3 py-2 rounded-lg text-sm font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50 disabled:opacity-50'

// One record's append-only change history, fetched on demand.
function EventHistory({ recordType, recordId }: { recordType: string; recordId: string }) {
  const [events, setEvents] = useState<ComplianceEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/portal/admin/compliance/events?type=${recordType}&id=${recordId}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) setEvents(json.data as ComplianceEvent[])
      else setError(json?.message ?? 'History did not load.')
    } catch {
      setError('History did not load. Check your connection.')
    }
  }, [recordType, recordId])
  return (
    <details
      className="mt-2"
      onToggle={e => {
        if ((e.target as HTMLDetailsElement).open && events === null) void load()
      }}
    >
      <summary className="text-[11px] text-cool-400 cursor-pointer select-none py-1">
        change history (who and when, append-only)
      </summary>
      {error && <p className="text-[11px] text-red-600 font-ui mt-1">{error}</p>}
      {events === null && !error && <p className="text-[11px] text-cool-400 font-ui mt-1">loading…</p>}
      {events && events.length === 0 && (
        <p className="text-[11px] text-cool-400 font-ui mt-1">No events recorded.</p>
      )}
      {events && events.length > 0 && (
        <div className="mt-1 space-y-1">
          {events.map(ev => (
            <p key={ev.id} className="text-[11px] text-cool-500 font-ui">
              <span className="font-semibold text-cool-600">{ev.action.replace(/_/g, ' ')}</span> by {ev.actor}{' '}
              {fmtWhen(ev.created_at)}
              {ev.detail && Object.keys(ev.detail).length > 0 && (
                <span className="text-cool-400"> · {JSON.stringify(ev.detail)}</span>
              )}
            </p>
          ))}
        </div>
      )}
    </details>
  )
}

export default function ComplianceModule({
  initial,
  canManage,
  todayYMD,
}: {
  initial: ComplianceInitial
  canManage: boolean
  todayYMD: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const tab: Tab = TABS.find(t => t === sp.get('tab')) ?? 'dashboard'

  const [credentials, setCredentials] = useState(initial.credentials)
  const [complaints, setComplaints] = useState(initial.complaints)
  const [policies, setPolicies] = useState(initial.policies)
  const [acks, setAcks] = useState(initial.acks)
  const [banner, setBanner] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const setTab = (t: Tab) => {
    const params = new URLSearchParams(sp.toString())
    if (t === 'dashboard') params.delete('tab')
    else params.set('tab', t)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const refetch = useCallback(async (what: 'credentials' | 'complaints' | 'policies') => {
    try {
      const res = await fetch(`/api/portal/admin/compliance/${what}`, {
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (!json?.ok) return
      if (what === 'credentials') setCredentials(json.data as ComplianceCredential[])
      if (what === 'complaints') setComplaints(json.data as ComplianceComplaint[])
      if (what === 'policies') {
        setPolicies((json.data as { policies: CompliancePolicy[] }).policies)
        setAcks((json.data as { acks: CompliancePolicyAck[] }).acks)
      }
    } catch {
      // The banner from the failed action already tells the story.
    }
  }, [])

  async function post(url: string, body: unknown): Promise<{ ok: boolean; message?: string; data?: any }> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      return json ?? { ok: false, message: `Unexpected response (HTTP ${res.status}).` }
    } catch {
      return { ok: false, message: 'Could not reach the server. Check your connection and retry.' }
    }
  }

  const notify = (tone: 'green' | 'red', text: string) => {
    setBanner({ tone, text })
    window.setTimeout(() => setBanner(null), 6000)
  }

  if (!initial.storeConfigured) {
    return (
      <div className="mt-6 bg-white border border-cool-200 rounded-[9px] p-5">
        <p className="text-sm text-cool-500 font-ui">
          The compliance store is not configured (FOXCA_SUPABASE_URL and FOXCA_SUPABASE_KEY).
          Credentials, the register, and policies appear once it is.
        </p>
      </div>
    )
  }

  const activeCredentials = credentials.filter(c => c.status === 'active')
  const openComplaints = complaints.filter(c => c.status === 'open' || c.status === 'investigating')
  const activePolicies = policies.filter(p => p.status === 'active')
  const ackFor = (p: CompliancePolicy) => acks.filter(a => a.policy_id === p.id && a.version === p.version)

  return (
    <div>
      {initial.storeError && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-[9px] px-4 py-3">
          <p className="text-sm text-amber-800 font-ui">
            The compliance store did not answer fully: {initial.storeError}. Reload to retry.
          </p>
        </div>
      )}
      {banner && (
        <div
          className={`sticky top-2 z-20 mt-4 rounded-lg px-4 py-2.5 text-sm font-ui border ${
            banner.tone === 'green'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Tabs: client-state buttons restyled to the design-system tab look
          (hairline track, navy active); the ?tab= handlers are unchanged. */}
      <div className="mt-5 flex flex-wrap gap-x-5 border-b border-cool-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px inline-flex items-center border-b-2 px-0.5 pb-2 pt-1 font-heading text-[13px] motion-safe:transition-colors ${
              tab === t
                ? 'border-navy font-semibold text-navy'
                : 'border-transparent font-medium text-cool-600 hover:text-navy'
            }`}
            data-testid={`compliance-tab-${t}`}
          >
            {t === 'dashboard'
              ? 'Dashboard'
              : t === 'credentials'
                ? 'Licences and credentials'
                : t === 'register'
                  ? 'Complaints and incidents'
                  : 'Policy library'}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && (
        <div className="mt-4 space-y-4" data-testid="compliance-dashboard">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryTile
              title="Credentials"
              onOpen={() => setTab('credentials')}
              body={
                activeCredentials.length === 0
                  ? 'none recorded'
                  : `${activeCredentials.length} active` +
                    (activeCredentials.some(c => credentialTone(c.expires_on, todayYMD) === 'red')
                      ? ', renewal inside 14 days'
                      : activeCredentials.some(c => credentialTone(c.expires_on, todayYMD) === 'amber')
                        ? ', renewal inside 60 days'
                        : ', none near renewal')
              }
              tone={
                activeCredentials.some(c => credentialTone(c.expires_on, todayYMD) === 'red')
                  ? 'red'
                  : activeCredentials.some(c => credentialTone(c.expires_on, todayYMD) === 'amber')
                    ? 'amber'
                    : 'ok'
              }
            />
            <SummaryTile
              title="Complaints and incidents"
              onOpen={() => setTab('register')}
              body={
                complaints.length === 0
                  ? 'register is empty'
                  : `${openComplaints.length} open of ${complaints.length} recorded`
              }
              tone={openComplaints.length > 0 ? 'amber' : 'ok'}
            />
            <SummaryTile
              title="Policies"
              onOpen={() => setTab('policies')}
              body={
                activePolicies.length === 0
                  ? 'none yet'
                  : `${activePolicies.length} active, ${activePolicies.filter(p => ackFor(p).length > 0).length} acknowledged on the current version`
              }
              tone="ok"
            />
            <SummaryTile
              title="Files reading attention"
              body={
                initial.workbenchOk
                  ? initial.attentionDeals.length === 0
                    ? 'none from recorded signals'
                    : `${initial.attentionDeals.length} file${initial.attentionDeals.length === 1 ? '' : 's'}`
                  : 'workbench not answering'
              }
              tone={initial.attentionDeals.length > 0 ? 'amber' : initial.workbenchOk ? 'ok' : 'gray'}
            />
          </div>

          {/* Credential expiries approaching */}
          <div className="bg-white border border-cool-200 rounded-[9px] p-5">
            <h2 className="font-heading text-navy font-bold text-base mb-3">Renewals approaching</h2>
            {activeCredentials.filter(c => credentialTone(c.expires_on, todayYMD) !== 'ok').length === 0 ? (
              <p className="text-sm text-cool-400 font-ui">
                Nothing inside the {CREDENTIAL_AMBER_DAYS}-day window, and every recorded date is
                beyond it.
              </p>
            ) : (
              <div className="space-y-2">
                {activeCredentials
                  .filter(c => credentialTone(c.expires_on, todayYMD) !== 'ok')
                  .map(c => {
                    const tone = credentialTone(c.expires_on, todayYMD)
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm font-ui">
                        <Chip tone={TONE_CHIP[tone]}>
                          {tone === 'no-date'
                            ? 'no date recorded'
                            : `${daysUntil(c.expires_on!, todayYMD)} days`}
                        </Chip>
                        <span className="text-navy font-semibold">{c.name}</span>
                        {!c.date_confirmed && c.expires_on && (
                          <Chip tone="amber">confirm date</Chip>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Deals whose compliance card reads attention */}
          <div className="bg-white border border-cool-200 rounded-[9px] p-5">
            <h2 className="font-heading text-navy font-bold text-base mb-3">Files reading attention</h2>
            {!initial.workbenchOk ? (
              <p className="text-sm text-cool-400 font-ui">
                The workbench did not answer; per-file signals are unavailable right now.
              </p>
            ) : initial.attentionDeals.length === 0 ? (
              <p className="text-sm text-cool-400 font-ui">
                No file has an open compliance_gap flag or an overdue compliance-bearing condition.
              </p>
            ) : (
              <div className="space-y-2">
                {initial.attentionDeals.map(d => (
                  <div key={d.dealId} className="flex flex-wrap items-baseline gap-2 text-sm font-ui">
                    <Link
                      href={`/portal/admin/deals/${d.dealId}`}
                      className="text-navy font-semibold underline hover:text-ink"
                    >
                      {d.fileRef}
                    </Link>
                    <span className="text-xs text-cool-500">{d.reasons.join('; ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Honest gaps */}
          <div className="bg-cool-50 border border-cool-200 rounded-[9px] p-5">
            <h2 className="font-heading text-navy font-bold text-base mb-2">What the workbench does not capture yet</h2>
            <p className="text-xs text-cool-500 font-ui mb-2">
              These fields render as honest gaps on every file's compliance card and never count
              toward a clear posture. They are the follow-up list for a future fox-underwriting
              session.
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {WORKBENCH_GAP_FIELDS.map(f => (
                <li key={f} className="text-sm text-cool-600 font-ui">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Credentials ── */}
      {tab === 'credentials' && (
        <CredentialsTab
          credentials={credentials}
          canManage={canManage}
          todayYMD={todayYMD}
          post={post}
          notify={notify}
          refetch={() => refetch('credentials')}
        />
      )}

      {/* ── Register ── */}
      {tab === 'register' && (
        <RegisterTab
          complaints={complaints}
          canManage={canManage}
          post={post}
          notify={notify}
          refetch={() => refetch('complaints')}
        />
      )}

      {/* ── Policies ── */}
      {tab === 'policies' && (
        <PoliciesTab
          policies={policies}
          acks={acks}
          canManage={canManage}
          post={post}
          notify={notify}
          refetch={() => refetch('policies')}
        />
      )}
    </div>
  )
}

function SummaryTile({
  title,
  body,
  tone,
  onOpen,
}: {
  title: string
  body: string
  tone: 'ok' | 'amber' | 'red' | 'gray'
  onOpen?: () => void
}) {
  const dot =
    tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'ok' ? 'bg-green-500' : 'bg-cool-300'
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="font-heading font-bold text-navy text-sm">{title}</span>
      </div>
      <p className="text-xs text-cool-500 font-ui mt-1.5">{body}</p>
    </>
  )
  return onOpen ? (
    <button onClick={onOpen} className="text-left bg-white border border-cool-200 rounded-[9px] px-4 py-3 hover:border-navy/40">
      {inner}
    </button>
  ) : (
    <div className="bg-white border border-cool-200 rounded-[9px] px-4 py-3">{inner}</div>
  )
}

// ─── Credentials tab ─────────────────────────────────────────────────────────

function CredentialsTab({
  credentials,
  canManage,
  todayYMD,
  post,
  notify,
  refetch,
}: {
  credentials: ComplianceCredential[]
  canManage: boolean
  todayYMD: string
  post: (url: string, body: unknown) => Promise<{ ok: boolean; message?: string }>
  notify: (tone: 'green' | 'red', text: string) => void
  refetch: () => void
}) {
  const empty = { id: null as string | null, name: '', holder: 'Michael Fox', expiresOn: '', dateConfirmed: false, notes: '' }
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [retireArm, setRetireArm] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    const res = await post('/api/portal/admin/compliance/credentials', {
      id: form.id ?? undefined,
      name: form.name,
      holder: form.holder,
      expiresOn: form.expiresOn || null,
      dateConfirmed: form.dateConfirmed,
      notes: form.notes || null,
    })
    setBusy(false)
    if (res.ok) {
      notify('green', form.id ? 'Credential updated; the change is in its history.' : 'Credential added.')
      setForm(empty)
      refetch()
    } else notify('red', res.message ?? 'Save failed.')
  }

  async function retire(id: string) {
    setRetireArm(null)
    setBusy(true)
    const res = await post(`/api/portal/admin/compliance/credentials/${id}/retire`, {})
    setBusy(false)
    if (res.ok) {
      notify('green', 'Credential retired. It stays visible with its history; nothing deletes.')
      refetch()
    } else notify('red', res.message ?? 'Retire failed.')
  }

  const active = credentials.filter(c => c.status === 'active')
  const retired = credentials.filter(c => c.status === 'retired')

  const renderRow = (c: ComplianceCredential) => {
    const tone = credentialTone(c.expires_on, todayYMD)
    return (
      <div key={c.id} className="bg-white border border-cool-200 rounded-[9px] p-3" data-testid={`credential-${c.id}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-ui font-semibold text-navy">{c.name}</span>
          {c.status === 'active' ? (
            <Chip tone={TONE_CHIP[tone]}>
              {tone === 'no-date'
                ? 'no date recorded'
                : tone === 'ok'
                  ? `renews ${c.expires_on}`
                  : `${daysUntil(c.expires_on!, todayYMD)} days to ${c.expires_on}`}
            </Chip>
          ) : (
            <Chip tone="gray">retired</Chip>
          )}
          {!c.date_confirmed && c.status === 'active' && (
            <Chip tone="amber">confirm date</Chip>
          )}
        </div>
        <p className="text-xs text-cool-500 font-ui mt-1">
          Holder {c.holder}
          {c.notes ? ` · ${c.notes}` : ''}
        </p>
        <p className="text-[11px] text-cool-400 font-ui mt-1">
          last change by {c.updated_by} {fmtWhen(c.updated_at)}
          {c.retired_at ? ` · retired by ${c.retired_by} ${fmtWhen(c.retired_at)}` : ''}
        </p>
        {canManage && c.status === 'active' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className={btnQuiet}
              disabled={busy}
              onClick={() =>
                setForm({
                  id: c.id,
                  name: c.name,
                  holder: c.holder,
                  expiresOn: c.expires_on ?? '',
                  dateConfirmed: c.date_confirmed,
                  notes: c.notes ?? '',
                })
              }
            >
              Edit
            </button>
            <button
              className={`${btnQuiet} ${retireArm === c.id ? 'border-red-400 text-red-700 bg-red-50' : ''}`}
              disabled={busy}
              onClick={() => (retireArm === c.id ? void retire(c.id) : setRetireArm(c.id))}
            >
              {retireArm === c.id ? 'Tap again to retire' : 'Retire'}
            </button>
          </div>
        )}
        <EventHistory recordType="credential" recordId={c.id} />
      </div>
    )
  }

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        {active.length === 0 && (
          <p className="text-sm text-cool-400 font-ui bg-white border border-cool-200 rounded-[9px] p-5">
            No active credentials recorded.
          </p>
        )}
        {active.map(renderRow)}
        {retired.length > 0 && (
          <details className="mt-2">
            <summary className="text-sm font-semibold text-cool-500 cursor-pointer select-none py-1.5">
              Retired ({retired.length}): kept with history, never deleted
            </summary>
            <div className="mt-2 space-y-3">{retired.map(renderRow)}</div>
          </details>
        )}
      </div>
      {canManage && (
        <div className="bg-white border border-cool-200 rounded-[9px] p-4 lg:self-start">
          <h3 className="font-heading text-navy font-bold text-sm mb-3">
            {form.id ? 'Edit credential' : 'Add a credential'}
          </h3>
          <div className="space-y-2.5">
            <input
              className={inputCls}
              placeholder="Name (e.g. FSRA licence)"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Holder"
              value={form.holder}
              onChange={e => setForm(f => ({ ...f, holder: e.target.value }))}
            />
            <input
              type="date"
              className={inputCls}
              value={form.expiresOn}
              onChange={e => setForm(f => ({ ...f, expiresOn: e.target.value }))}
            />
            <label className="flex items-center gap-2 text-xs font-ui text-cool-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.dateConfirmed}
                onChange={e => setForm(f => ({ ...f, dateConfirmed: e.target.checked }))}
                className="accent-navy"
              />
              The date above is confirmed, not a placeholder
            </label>
            <textarea
              className={`${inputCls} resize-y`}
              rows={2}
              placeholder="Notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
            <div className="flex gap-2">
              <button className={btnPrimary} disabled={busy || !form.name.trim()} onClick={() => void save()}>
                {busy ? 'Working…' : form.id ? 'Save changes' : 'Add credential'}
              </button>
              {form.id && (
                <button className={btnQuiet} onClick={() => setForm(empty)}>
                  Cancel
                </button>
              )}
            </div>
            <p className="text-[11px] text-cool-400 font-ui">
              Every change records who and when. Items within {CREDENTIAL_AMBER_DAYS} days of expiry
              join the home attention rail; within {CREDENTIAL_RED_DAYS} days they go red.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Complaints and incidents tab ────────────────────────────────────────────

const COMPLAINT_STATUSES = ['open', 'investigating', 'resolved', 'reported'] as const

const STATUS_CHIP: Record<string, ChipTone | 'navy'> = {
  open: 'red',
  investigating: 'amber',
  resolved: 'green',
  reported: 'navy',
}

function RegisterTab({
  complaints,
  canManage,
  post,
  notify,
  refetch,
}: {
  complaints: ComplianceComplaint[]
  canManage: boolean
  post: (url: string, body: unknown) => Promise<{ ok: boolean; message?: string }>
  notify: (tone: 'green' | 'red', text: string) => void
  refetch: () => void
}) {
  const empty = { receivedOn: '', source: '', summary: '', reference: '' }
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({})

  async function create() {
    setBusy(true)
    const res = await post('/api/portal/admin/compliance/complaints', {
      receivedOn: form.receivedOn,
      source: form.source,
      summary: form.summary,
      reference: form.reference || null,
    })
    setBusy(false)
    if (res.ok) {
      notify('green', 'Recorded in the register with who and when.')
      setForm(empty)
      refetch()
    } else notify('red', res.message ?? 'Create failed.')
  }

  async function setStatus(id: string, status: string) {
    setBusy(true)
    const res = await post(`/api/portal/admin/compliance/complaints/${id}/status`, {
      status,
      note: statusNotes[id]?.trim() || undefined,
    })
    setBusy(false)
    if (res.ok) {
      notify('green', `Status set to ${status}; the change is in the record's history.`)
      setStatusNotes(n => ({ ...n, [id]: '' }))
      refetch()
    } else notify('red', res.message ?? 'Status change failed.')
  }

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        {complaints.length === 0 ? (
          <div className="bg-white border border-cool-200 rounded-[9px] p-5">
            <p className="text-sm text-cool-600 font-ui font-semibold">The register is empty.</p>
            <p className="text-sm text-cool-500 font-ui mt-1.5">
              FSRA expects a supervised practice to keep a complaint and incident register even when
              there is nothing to record. This is that register: when a complaint or incident
              arrives, record it here with its received date, source, and summary, and track its
              status to resolved or reported. Every change keeps who and when.
            </p>
          </div>
        ) : (
          complaints.map(c => (
            <div key={c.id} className="bg-white border border-cool-200 rounded-[9px] p-4" data-testid={`complaint-${c.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={STATUS_CHIP[c.status] ?? 'gray'}>{c.status}</Chip>
                <span className="text-sm font-ui font-semibold text-navy tabular-nums">received {c.received_on}</span>
                <span className="text-xs text-cool-500 font-ui">from {c.source}</span>
                {c.reference && <Chip tone="gray">ref {c.reference}</Chip>}
              </div>
              <p className="text-sm text-cool-700 font-ui mt-2 whitespace-pre-wrap break-words">{c.summary}</p>
              {c.resolution_notes && (
                <p className="text-xs text-cool-600 font-ui mt-1.5 bg-cool-50 rounded-lg px-2.5 py-1.5">
                  Resolution: {c.resolution_notes}
                </p>
              )}
              <p className="text-[11px] text-cool-400 font-ui mt-1.5">
                recorded by {c.created_by} {fmtWhen(c.created_at)} · last change by {c.updated_by}{' '}
                {fmtWhen(c.updated_at)}
              </p>
              {canManage && (
                <div className="mt-2.5">
                  <input
                    className={inputCls}
                    placeholder="Note for the next status change (kept in the history)"
                    value={statusNotes[c.id] ?? ''}
                    onChange={e => setStatusNotes(n => ({ ...n, [c.id]: e.target.value }))}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMPLAINT_STATUSES.filter(s => s !== c.status).map(s => (
                      <button key={s} className={btnQuiet} disabled={busy} onClick={() => void setStatus(c.id, s)}>
                        {s === 'open' ? 'Reopen' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <EventHistory recordType="complaint" recordId={c.id} />
            </div>
          ))
        )}
      </div>
      {canManage && (
        <div className="bg-white border border-cool-200 rounded-[9px] p-4 lg:self-start">
          <h3 className="font-heading text-navy font-bold text-sm mb-3">Record a complaint or incident</h3>
          <div className="space-y-2.5">
            <input
              type="date"
              className={inputCls}
              value={form.receivedOn}
              onChange={e => setForm(f => ({ ...f, receivedOn: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Source (client name, lender, FSRA, internal)"
              value={form.source}
              onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
            />
            <textarea
              className={`${inputCls} resize-y`}
              rows={3}
              placeholder="Summary of the complaint or incident"
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Reference (a deal file ref or Zoho id, optional)"
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
            />
            <button
              className={btnPrimary}
              disabled={busy || !form.receivedOn || !form.source.trim() || !form.summary.trim()}
              onClick={() => void create()}
            >
              {busy ? 'Working…' : 'Record it'}
            </button>
            <p className="text-[11px] text-cool-400 font-ui">
              Records never delete. The reference is plain text; nothing writes to Zoho or the
              workbench from here.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Policy library tab ──────────────────────────────────────────────────────

function PoliciesTab({
  policies,
  acks,
  canManage,
  post,
  notify,
  refetch,
}: {
  policies: CompliancePolicy[]
  acks: CompliancePolicyAck[]
  canManage: boolean
  post: (url: string, body: unknown) => Promise<{ ok: boolean; message?: string }>
  notify: (tone: 'green' | 'red', text: string) => void
  refetch: () => void
}) {
  const empty = { id: null as string | null, title: '', bodyMd: '', effectiveOn: '' }
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [openPolicy, setOpenPolicy] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    const res = form.id
      ? await post(`/api/portal/admin/compliance/policies/${form.id}`, {
          title: form.title,
          bodyMd: form.bodyMd,
          effectiveOn: form.effectiveOn || null,
          status: 'active',
        })
      : await post('/api/portal/admin/compliance/policies', {
          title: form.title,
          bodyMd: form.bodyMd,
          effectiveOn: form.effectiveOn || null,
        })
    setBusy(false)
    if (res.ok) {
      notify('green', form.id ? 'Policy updated; the previous version is retained.' : 'Policy created as version 1.')
      setForm(empty)
      refetch()
    } else notify('red', res.message ?? 'Save failed.')
  }

  async function acknowledge(p: CompliancePolicy) {
    setBusy(true)
    const res = (await post(`/api/portal/admin/compliance/policies/${p.id}/ack`, { version: p.version })) as {
      ok: boolean
      message?: string
      data?: { acknowledged?: boolean; alreadyAcked?: boolean }
    }
    setBusy(false)
    if (res.ok) {
      notify(
        'green',
        res.data?.alreadyAcked
          ? 'You already acknowledged this version; the original record stands.'
          : `Acknowledged version ${p.version}, recorded with your email and the time.`,
      )
      refetch()
    } else notify('red', res.message ?? 'Acknowledge failed.')
  }

  async function retire(p: CompliancePolicy) {
    setBusy(true)
    const res = await post(`/api/portal/admin/compliance/policies/${p.id}`, {
      title: p.title,
      bodyMd: p.body_md,
      effectiveOn: p.effective_on,
      status: 'retired',
    })
    setBusy(false)
    if (res.ok) {
      notify('green', 'Policy retired; every version stays retained.')
      refetch()
    } else notify('red', res.message ?? 'Retire failed.')
  }

  const ackFor = (p: CompliancePolicy) => acks.filter(a => a.policy_id === p.id && a.version === p.version)

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
      <div className="space-y-3">
        {policies.length === 0 ? (
          <div className="bg-white border border-cool-200 rounded-[9px] p-5">
            <p className="text-sm text-cool-600 font-ui font-semibold">No policies yet.</p>
            <p className="text-sm text-cool-500 font-ui mt-1.5">
              The library holds the practice's written policies as versioned documents with
              read-and-acknowledge records. With one person today the mechanics are simple, which
              is the right time to build the habit: the day a hire exists, their onboarding
              checklist points here.
            </p>
            <p className="text-sm text-cool-500 font-ui mt-1.5">
              Two natural first entries, when you want them: the UI test automation discipline
              (test ids, TEST rows, preview-only decision testing) and the copy rules the platform
              writes by. These are suggestions; nothing is created for you.
            </p>
          </div>
        ) : (
          policies.map(p => {
            const currentAcks = ackFor(p)
            return (
              <div key={p.id} className="bg-white border border-cool-200 rounded-[9px] p-4" data-testid={`policy-${p.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-ui font-semibold text-navy">{p.title}</span>
                  <Chip tone="gray">v{p.version}</Chip>
                  {p.status === 'retired' && <Chip tone="gray">retired</Chip>}
                  {p.effective_on && <Chip tone="gray">effective {p.effective_on}</Chip>}
                  <Chip tone={currentAcks.length > 0 ? 'green' : 'amber'}>
                    {currentAcks.length} acknowledgment{currentAcks.length === 1 ? '' : 's'} on v{p.version}
                  </Chip>
                </div>
                <p className="text-[11px] text-cool-400 font-ui mt-1">
                  last change by {p.updated_by} {fmtWhen(p.updated_at)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={btnQuiet} onClick={() => setOpenPolicy(openPolicy === p.id ? null : p.id)}>
                    {openPolicy === p.id ? 'Hide' : 'Read'}
                  </button>
                  {p.status === 'active' && (
                    <button className={btnQuiet} disabled={busy} onClick={() => void acknowledge(p)}>
                      Acknowledge v{p.version}
                    </button>
                  )}
                  {canManage && p.status === 'active' && (
                    <>
                      <button
                        className={btnQuiet}
                        onClick={() =>
                          setForm({ id: p.id, title: p.title, bodyMd: p.body_md, effectiveOn: p.effective_on ?? '' })
                        }
                      >
                        Edit (new version)
                      </button>
                      <button className={btnQuiet} disabled={busy} onClick={() => void retire(p)}>
                        Retire
                      </button>
                    </>
                  )}
                </div>
                {openPolicy === p.id && (
                  <div className="mt-3 border-t border-cool-100 pt-3 prose prose-sm max-w-none font-ui">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body_md}</ReactMarkdown>
                  </div>
                )}
                {currentAcks.length > 0 && (
                  <p className="text-[11px] text-cool-400 font-ui mt-2">
                    {currentAcks.map(a => `${a.acked_by} ${fmtWhen(a.acked_at)}`).join(' · ')}
                  </p>
                )}
                <EventHistory recordType="policy" recordId={p.id} />
              </div>
            )
          })
        )}
      </div>
      {canManage && (
        <div className="bg-white border border-cool-200 rounded-[9px] p-4 lg:self-start">
          <h3 className="font-heading text-navy font-bold text-sm mb-3">
            {form.id ? 'Edit policy (creates a new version)' : 'Write a policy'}
          </h3>
          <div className="space-y-2.5">
            <input
              className={inputCls}
              placeholder="Title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            <textarea
              className={`${inputCls} resize-y font-mono text-xs`}
              rows={10}
              placeholder="Policy body, markdown"
              value={form.bodyMd}
              onChange={e => setForm(f => ({ ...f, bodyMd: e.target.value }))}
            />
            <input
              type="date"
              className={inputCls}
              value={form.effectiveOn}
              onChange={e => setForm(f => ({ ...f, effectiveOn: e.target.value }))}
            />
            <div className="flex gap-2">
              <button
                className={btnPrimary}
                disabled={busy || !form.title.trim() || !form.bodyMd.trim()}
                onClick={() => void save()}
              >
                {busy ? 'Working…' : form.id ? 'Save as new version' : 'Create policy'}
              </button>
              {form.id && (
                <button className={btnQuiet} onClick={() => setForm(empty)}>
                  Cancel
                </button>
              )}
            </div>
            <p className="text-[11px] text-cool-400 font-ui">
              Every version is retained; acknowledgments attach to the version that was read.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
