'use client'

// Provisioning wizard (Session 8). One flow per person type:
//   staff   — Clerk user + role, grants shown before confirm.
//   partner — Clerk user + role + the Zoho partner id picked from a
//             search (never typed).
//   agent   — Clerk user + the workbench half through POST
//             /api/gates/agents, with setup_remaining rendered as the
//             honest hand-back checklist.
// Confirm is two-tap with the arm window enforced by timestamp at tap
// time. The gates token (agent flow) is minted in the browser per action
// and forwarded in x-gates-token, same posture as every gate decision.

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Check, AlertTriangle, UserPlus } from 'lucide-react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'

export interface WizardPartner {
  id: string
  name: string
  email: string | null
  partnerType: string | null
}

export interface GrantView {
  key: string
  label: string
}

type PersonType = 'staff' | 'partner' | 'agent'
type StaffRole = 'ops' | 'underwriting-reviewer'
type PartnerKind = 'fp' | 'realtor' | 'lawyer' | 'mortgage_agent' | 'investor'

const PARTNER_KIND_META: { kind: PartnerKind; label: string; zohoType: string }[] = [
  { kind: 'fp', label: 'Financial Planner', zohoType: 'Financial Planner' },
  { kind: 'realtor', label: 'Realtor', zohoType: 'Realtor' },
  { kind: 'lawyer', label: 'Lawyer', zohoType: 'Lawyer' },
  { kind: 'mortgage_agent', label: 'Mortgage Agent (referral partner)', zohoType: 'Mortgage Agent' },
  { kind: 'investor', label: 'Investor', zohoType: 'Investor' },
]

interface ProvisionResult {
  clerkUserId: string
  roles: string[]
  workbenchAgentId: string | null
  setupRemaining: { item: string; note: string }[] | null
  workbenchError: string | null
  inviteSent: boolean
  recordWarning: string | null
}

const ARM_WINDOW_MS = 4000

export default function ProvisionWizard({
  partners,
  roleGrants,
  gatesReady,
}: {
  partners: WizardPartner[]
  /** Admin-surface grants per selectable internal role. */
  roleGrants: Record<string, GrantView[]>
  gatesReady: boolean
}) {
  const mintGatesToken = useGatesToken()

  const [personType, setPersonType] = useState<PersonType | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [staffRole, setStaffRole] = useState<StaffRole>('ops')
  const [partnerKind, setPartnerKind] = useState<PartnerKind>('fp')
  const [partnerSearch, setPartnerSearch] = useState('')
  const [zohoPartnerId, setZohoPartnerId] = useState('')
  const [fsraLicence, setFsraLicence] = useState('')
  const [officePhone, setOfficePhone] = useState('')
  const [sendInvite, setSendInvite] = useState(true)

  const [armed, setArmed] = useState(false)
  const armedAt = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProvisionResult | null>(null)

  const kindMeta = PARTNER_KIND_META.find(k => k.kind === partnerKind)!
  const kindPartners = useMemo(
    () => partners.filter(p => p.partnerType === kindMeta.zohoType),
    [partners, kindMeta.zohoType],
  )
  const filteredPartners = useMemo(() => {
    const needle = partnerSearch.trim().toLowerCase()
    const base = needle
      ? kindPartners.filter(
          p =>
            p.name.toLowerCase().includes(needle) ||
            (p.email ?? '').toLowerCase().includes(needle),
        )
      : kindPartners
    return base.slice(0, 12)
  }, [kindPartners, partnerSearch])
  const selectedPartner = partners.find(p => p.id === zohoPartnerId) ?? null

  const internalRole =
    personType === 'staff' ? staffRole : personType === 'agent' ? 'agent' : null
  const grants = internalRole ? (roleGrants[internalRole] ?? []) : []

  const detailsComplete = (() => {
    if (!personType) return false
    if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return false
    if (personType === 'partner') return zohoPartnerId.length > 0
    if (personType === 'agent') return fsraLicence.trim().length >= 2
    return true
  })()

  const pickPartner = (p: WizardPartner) => {
    setZohoPartnerId(p.id)
    if (!name.trim()) setName(p.name)
    if (!email.trim() && p.email) setEmail(p.email)
  }

  const submit = async () => {
    const now = Date.now()
    if (!armed || now - armedAt.current > ARM_WINDOW_MS) {
      setArmed(true)
      armedAt.current = now
      setTimeout(() => setArmed(false), ARM_WINDOW_MS)
      return
    }
    setArmed(false)
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        personType,
        name: name.trim(),
        email: email.trim(),
        sendInvite,
      }
      if (personType === 'staff') body.role = staffRole
      if (personType === 'partner') {
        body.partnerKind = partnerKind
        body.zohoPartnerId = zohoPartnerId
      }
      if (personType === 'agent') {
        body.fsraLicence = fsraLicence.trim()
        if (officePhone.trim()) body.officePhone = officePhone.trim()
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (personType === 'agent') {
        const token = await mintGatesToken()
        if (token) headers[GATES_TOKEN_HEADER] = token
      }
      const res = await fetch('/api/portal/admin/people/provision', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Provisioning failed.')
        return
      }
      setResult(data as ProvisionResult)
    } catch {
      setError('Provisioning failed — network error.')
    } finally {
      setBusy(false)
    }
  }

  // ── Result panel ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="space-y-4" data-testid="provision-result">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 text-navy">
            <Check className="w-5 h-5" style={{ color: '#7ab800' }} />
            <h2 className="font-heading font-bold text-base">Provisioned</h2>
          </div>
          <dl className="mt-3 text-sm font-body space-y-1.5">
            <div className="flex gap-2">
              <dt className="text-gray-400 w-32 shrink-0">Clerk user</dt>
              <dd className="text-navy break-all">{result.clerkUserId}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-400 w-32 shrink-0">Roles</dt>
              <dd className="text-navy">{result.roles.join(', ')}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-400 w-32 shrink-0">Invitation</dt>
              <dd className="text-navy">
                {result.inviteSent
                  ? 'Sent — they set a password through “Forgot password” on first sign-in.'
                  : 'Not sent. Send them the sign-in link when ready.'}
              </dd>
            </div>
            {result.workbenchAgentId && (
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32 shrink-0">Workbench agent</dt>
                <dd className="text-navy break-all">{result.workbenchAgentId}</dd>
              </div>
            )}
          </dl>
        </div>

        {result.workbenchError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm font-body text-amber-800">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Workbench half incomplete
            </p>
            <p className="mt-1">{result.workbenchError}</p>
          </div>
        )}

        {result.setupRemaining && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-heading text-navy font-bold text-sm">
              Setup remaining (from the workbench)
            </h3>
            <p className="text-xs text-gray-400 font-body mt-0.5">
              What a working agent still needs that provisioning alone does not give. Nothing
              below happens automatically.
            </p>
            {result.setupRemaining.length === 0 ? (
              <p className="mt-3 text-sm font-body text-gray-500">Nothing remaining.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {result.setupRemaining.map(item => (
                  <li key={item.item} className="text-sm font-body">
                    <span className="text-navy font-semibold">
                      {item.item.replace(/_/g, ' ')}
                    </span>
                    <span className="text-gray-500"> — {item.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result.recordWarning && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm font-body text-amber-800">
            {result.recordWarning}
          </div>
        )}

        <Link
          href="/portal/admin/settings/people"
          className="inline-block bg-navy text-white font-heading font-bold text-sm px-4 py-2 rounded-lg hover:bg-navy/90"
        >
          Back to People
        </Link>
      </div>
    )
  }

  // ── The wizard ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Step 1: person type */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-sm mb-3">1. Who is joining?</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {(
            [
              {
                type: 'staff' as const,
                title: 'Staff',
                blurb: 'Ops or underwriting reviewer — works inside the command center.',
              },
              {
                type: 'partner' as const,
                title: 'Partner',
                blurb: 'Realtor, FP, lawyer, mortgage agent, or investor — their own portal.',
              },
              {
                type: 'agent' as const,
                title: 'Agent',
                blurb: 'A recruited agent: portal login plus their own workbench tenancy.',
              },
            ]
          ).map(opt => (
            <button
              key={opt.type}
              onClick={() => {
                setPersonType(opt.type)
                setError(null)
              }}
              data-testid={`person-type-${opt.type}`}
              className={`text-left border rounded-lg p-3 transition-colors ${
                personType === opt.type
                  ? 'border-navy bg-navy/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-heading font-bold text-sm text-navy">{opt.title}</p>
              <p className="text-xs text-gray-500 font-body mt-1">{opt.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: details */}
      {personType && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-heading text-navy font-bold text-sm mb-3">2. Details</h2>

          {personType === 'partner' && (
            <div className="mb-4">
              <p className="text-xs text-gray-400 font-body mb-2">Partner type</p>
              <div className="flex flex-wrap gap-2">
                {PARTNER_KIND_META.map(k => (
                  <button
                    key={k.kind}
                    onClick={() => {
                      setPartnerKind(k.kind)
                      setZohoPartnerId('')
                    }}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                      partnerKind === k.kind
                        ? 'bg-navy text-white border-navy'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <p className="text-xs text-gray-400 font-body mt-4 mb-1">
                Pick the Zoho partner record (the id is selected, never typed)
              </p>
              <input
                type="text"
                value={partnerSearch}
                onChange={e => setPartnerSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body"
              />
              <ul className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-56 overflow-y-auto">
                {filteredPartners.length === 0 && (
                  <li className="p-3 text-xs text-gray-400 font-body">
                    No {kindMeta.label} records match. The person needs a Zoho Partners record
                    (type {kindMeta.zohoType}) before portal access.
                  </li>
                )}
                {filteredPartners.map(p => (
                  <li key={p.id}>
                    <button
                      onClick={() => pickPartner(p)}
                      className={`w-full text-left p-2.5 text-sm font-body flex items-center justify-between gap-3 ${
                        zohoPartnerId === p.id ? 'bg-lime/10' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span>
                        <span className="text-navy">{p.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{p.email ?? 'no email'}</span>
                      </span>
                      {zohoPartnerId === p.id && (
                        <Check className="w-4 h-4 shrink-0" style={{ color: '#7ab800' }} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {selectedPartner && (
                <p className="mt-2 text-xs text-gray-500 font-body">
                  Selected: {selectedPartner.name} · Zoho id{' '}
                  <code className="text-navy">{selectedPartner.id}</code>
                </p>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-400 font-body">Full name</span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400 font-body">Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body"
              />
            </label>
          </div>

          {personType === 'staff' && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 font-body mb-2">Role</p>
              <div className="flex flex-wrap gap-2">
                {(['ops', 'underwriting-reviewer'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setStaffRole(r)}
                    data-testid={`staff-role-${r}`}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                      staffRole === r
                        ? 'bg-navy text-white border-navy'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {personType === 'agent' && (
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-400 font-body">FSRA licence</span>
                <input
                  type="text"
                  value={fsraLicence}
                  onChange={e => setFsraLicence(e.target.value)}
                  placeholder="M2…"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400 font-body">Office phone (optional)</span>
                <input
                  type="text"
                  value={officePhone}
                  onChange={e => setOfficePhone(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body"
                />
              </label>
              {!gatesReady && (
                <p className="sm:col-span-2 text-xs font-body text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  The Gates API is not connected, so only the Clerk half can be created today.
                  The workbench half (agents row, tenancy, setup checklist) runs the moment the
                  connection is back.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 3: review + confirm */}
      {personType && detailsComplete && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-heading text-navy font-bold text-sm mb-3">3. Review and confirm</h2>

          <div className="text-sm font-body space-y-2">
            <p>
              <span className="text-gray-400">Creating:</span>{' '}
              <span className="text-navy">
                {name.trim()} ({email.trim()})
              </span>
            </p>
            {internalRole ? (
              <div>
                <p className="text-gray-400">
                  Role <code className="text-navy">{internalRole}</code> carries exactly these
                  grants (from the authority matrix):
                </p>
                <ul className="mt-1.5 space-y-1">
                  {grants.map(g => (
                    <li key={g.key} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#7ab800' }} />
                      <span>
                        <code className="text-xs text-navy">{g.key}</code>{' '}
                        <span className="text-gray-500">— {g.label}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {personType === 'agent' && (
                  <p className="mt-2 text-xs text-gray-500">
                    Plus their own workbench tenancy through the Gates API — the setup checklist
                    it returns renders here, honestly, when it runs.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500">
                Role <code className="text-navy">{PARTNER_KIND_META.find(k => k.kind === partnerKind)?.label}</code>{' '}
                grants their own partner portal only — no admin-area access. The Zoho id{' '}
                <code className="text-navy">{zohoPartnerId}</code> is stamped in their Clerk
                metadata so their files resolve automatically.
              </p>
            )}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm font-body text-gray-600">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={e => setSendInvite(e.target.checked)}
              className="rounded border-gray-300"
            />
            Send the invitation email now (from noreply@app.foxmortgage.ca)
          </label>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-body text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy}
            data-testid="provision-confirm"
            className={`mt-4 inline-flex items-center gap-2 font-heading font-bold text-sm px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
              armed ? 'bg-red-600 text-white' : 'bg-lime text-navy hover:bg-lime-dark'
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {busy ? 'Provisioning…' : armed ? 'Tap again to confirm' : 'Provision'}
          </button>
        </div>
      )}
    </div>
  )
}
