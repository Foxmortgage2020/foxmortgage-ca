'use client'

// Generate Lender Notes — the deal-room card (finmo-substrate rebuild,
// 2026-07-15). Readiness-first: a strip above the button shows what the note
// will be built from (Application pulled / Target lender / Insured status /
// Rate / Calls / Emails), each gap fixable inline. Generate is disabled ONLY
// for a missing target lender (the greeting has no lender without it);
// everything else generates with what exists, because a thin honest note is
// acceptable and a blocked agent is not. The draft is editable in place; saving
// an edit writes an append-only human_edited row. Nothing is sent anywhere.
//
// B2b (Task 7): Generate and Regenerate wear the outline ink style — lime
// inside a room belongs only to queued decisions (the pending conditions
// approval banner keeps it). Every control here is calm navy or gray. Card chrome follows the client copy rules (no dashes); the
// DRAFT itself follows the skill's rules and is model output.

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import {
  runLenderNotesGeneration, runFinmoPull, runSubmissionSet, runNoteEdit,
  LENDER_NOTES_CEILING, type SubmissionActionName,
} from '@/lib/lender-notes-client'

export interface LenderNotesInitialDraft {
  generatedText: string
  charCount: number | null
  createdAt: string
  createdByEmail: string | null
  source?: string
}

export interface LenderNotesReadiness {
  targetLender: string | null
  insuredStatus: 'insured' | 'insurable' | 'uninsured' | null
  rateOverride: number | null
  rateFromFinmo: number | null
  snapshotPulledAt: string | null
  hasFinmoApp: boolean
  platformInsuredSuggestion: string | null
  calls: number
  emails: number
}

function hoursAgo(iso: string | null): string {
  if (!iso) return 'not pulled'
  const ms = Date.now() - new Date(iso).getTime()
  if (!(ms >= 0)) return 'pulled just now'
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'pulled under an hour ago'
  if (h === 1) return 'pulled 1 hour ago'
  if (h < 48) return `pulled ${h} hours ago`
  return `pulled ${Math.floor(h / 24)} days ago`
}

export default function LenderNotesCard({
  dealId,
  initialDraft,
  readiness,
  canGenerate,
  canManage,
  demo,
}: {
  dealId: string
  initialDraft: LenderNotesInitialDraft | null
  readiness: LenderNotesReadiness
  canGenerate: boolean
  canManage: boolean
  demo: boolean
}) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const [draft, setDraft] = useState<string>(initialDraft?.generatedText ?? '')
  const [advisor, setAdvisor] = useState('')
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState('') // '' | 'generate' | 'pull' | 'target' | 'insured' | 'rate' | 'edit'
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [savedEdit, setSavedEdit] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [staleOffer, setStaleOffer] = useState(false) // fresh pull failed; offer the snapshot
  // inline editors
  const [editField, setEditField] = useState('') // '' | 'target' | 'insured' | 'rate'
  const [fieldVal, setFieldVal] = useState('')
  const [rateNote, setRateNote] = useState('')

  const tokenArgs = { demo, mintToken: mintGatesToken, gatesTokenHeader: GATES_TOKEN_HEADER }

  // Generate ALWAYS pulls fresh from Finmo first (Step 1). On a pull failure it
  // fails loud and, if an older snapshot exists, offers an explicit second click
  // to generate from it (allowStale) — never silently stale.
  const generate = useCallback(async (allowStale = false) => {
    setBusy('generate'); setError(''); setNotice(''); setCopied(false); setStaleOffer(false)
    const result = await runLenderNotesGeneration({ dealId, advisorContext: advisor, allowStale, ...tokenArgs })
    if (result.ok && result.note) {
      setDraft(result.note); setComposing(false); setDirty(false)
      const notices: string[] = []
      if (result.overCeiling) {
        const over = (result.chars ?? result.note.length) - LENDER_NOTES_CEILING
        notices.push(`This draft is over the ${LENDER_NOTES_CEILING.toLocaleString('en-CA')} character ceiling and was not auto-trimmed. The figures are validated; only the length is not. Trim about ${Math.max(1, over).toLocaleString('en-CA')} characters by hand before sending.`)
      }
      if (result.replacedEditCount && result.replacedEditCount > 0) {
        notices.push('This regenerate replaced an edit you had saved. The edited version is kept in history.')
      }
      if (notices.length) setNotice(notices.join(' '))
      if (!demo) router.refresh()
    } else {
      setError(result.message ?? 'Generation failed. Try again.')
      if (result.staleFallbackAvailable) setStaleOffer(true)
    }
    setBusy('')
  }, [dealId, advisor, demo, mintGatesToken, router])

  const runField = useCallback(async (label: string, action: SubmissionActionName, value: string | number | null, note: string | null) => {
    setBusy(label); setError(''); setNotice('')
    const result = await runSubmissionSet({ dealId, action, value, note, ...tokenArgs })
    if (result.ok) { setEditField(''); setFieldVal(''); setRateNote(''); if (!demo) router.refresh(); else setNotice(result.message ?? '') }
    else setError(result.message ?? 'Could not save. Try again.')
    setBusy('')
  }, [dealId, demo, mintGatesToken, router])

  const pull = useCallback(async () => {
    setBusy('pull'); setError(''); setNotice('')
    const result = await runFinmoPull({ dealId, ...tokenArgs })
    if (result.ok) { if (!demo) router.refresh(); else setNotice(result.message ?? '') }
    else setError(result.message ?? 'Pull failed. Set the fields by hand.')
    setBusy('')
  }, [dealId, demo, mintGatesToken, router])

  const saveEdit = useCallback(async () => {
    setBusy('edit'); setError(''); setNotice('')
    const result = await runNoteEdit({ dealId, text: draft, ...tokenArgs })
    if (result.ok) { setSavedEdit(true); setDirty(false); setTimeout(() => setSavedEdit(false), 2500); if (!demo) router.refresh() }
    else setError(result.message ?? 'Could not save the edit.')
    setBusy('')
  }, [dealId, draft, demo, mintGatesToken, router])

  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setError('Could not copy to the clipboard. Select the text and copy it manually.') }
  }, [draft])

  const count = draft.length
  const over = count > LENDER_NOTES_CEILING
  const hasTarget = Boolean(readiness.targetLender)

  if (!canGenerate && !draft) {
    return (
      <p className="text-sm text-gray-400 font-body">
        Submission notes are generated in the deal room. Your account does not hold the notes permission.
      </p>
    )
  }

  // ── Readiness strip row ──
  const Row = ({ label, ok, value, children }: { label: string; ok: boolean; value: string; children?: React.ReactNode }) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 border-b border-gray-50 last:border-0">
      <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-navy' : 'bg-amber-400'}`} aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 font-body w-28">{label}</span>
      <span className={`text-sm font-body ${ok ? 'text-navy' : 'text-amber-700'}`}>{value}</span>
      {canManage && <span className="ml-auto flex items-center gap-2">{children}</span>}
    </div>
  )
  const SmallBtn = ({ onClick, children, busyKey }: { onClick: () => void; children: React.ReactNode; busyKey: string }) => (
    <button type="button" onClick={onClick} disabled={busy !== ''} className="text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50 disabled:opacity-50">
      {busy === busyKey ? '…' : children}
    </button>
  )

  return (
    <div data-testid="lender-notes-card">
      {/* Readiness strip: what the note will be built from. */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-1.5" data-testid="lender-notes-readiness">
        <Row label="Application" ok={Boolean(readiness.snapshotPulledAt)} value={hoursAgo(readiness.snapshotPulledAt)}>
          {readiness.hasFinmoApp
            ? <SmallBtn onClick={pull} busyKey="pull">{readiness.snapshotPulledAt ? 'Re-pull' : 'Pull from Finmo'}</SmallBtn>
            : <span className="text-[11px] text-gray-400 font-body">no Finmo file</span>}
        </Row>

        <Row label="Target lender" ok={hasTarget} value={readiness.targetLender ?? 'not set (required)'}>
          {editField === 'target' ? (
            <span className="flex items-center gap-1">
              <input autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)} placeholder="e.g. TD Mortgages"
                className="text-sm border border-gray-200 rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-navy" />
              <SmallBtn onClick={() => runField('target', 'set_target_lender', fieldVal, null)} busyKey="target">Save</SmallBtn>
              <button type="button" onClick={() => setEditField('')} className="text-xs text-gray-400 px-1">Cancel</button>
            </span>
          ) : (
            <SmallBtn onClick={() => { setEditField('target'); setFieldVal(readiness.targetLender ?? '') }} busyKey="_">{hasTarget ? 'Change' : 'Set'}</SmallBtn>
          )}
        </Row>

        <Row label="Insured status" ok={Boolean(readiness.insuredStatus)} value={readiness.insuredStatus ?? 'not set'}>
          {editField === 'insured' ? (
            <span className="flex items-center gap-1">
              <select autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
                className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-navy">
                <option value="">choose…</option>
                <option value="insured">insured</option>
                <option value="insurable">insurable</option>
                <option value="uninsured">uninsured</option>
              </select>
              <SmallBtn onClick={() => runField('insured', 'set_insured_status', fieldVal, null)} busyKey="insured">Save</SmallBtn>
              <button type="button" onClick={() => setEditField('')} className="text-xs text-gray-400 px-1">Cancel</button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {!readiness.insuredStatus && readiness.platformInsuredSuggestion && (
                <span className="text-[11px] text-gray-400 font-body italic">platform reads: {readiness.platformInsuredSuggestion}</span>
              )}
              <SmallBtn onClick={() => { setEditField('insured'); setFieldVal(readiness.insuredStatus ?? '') }} busyKey="_">{readiness.insuredStatus ? 'Change' : 'Set'}</SmallBtn>
            </span>
          )}
        </Row>

        <Row label="Rate" ok={readiness.rateOverride != null || readiness.rateFromFinmo != null}
          value={readiness.rateOverride != null ? `${readiness.rateOverride}% (override)` : readiness.rateFromFinmo != null ? `${readiness.rateFromFinmo}% (Finmo)` : 'not set'}>
          {editField === 'rate' ? (
            <span className="flex items-center gap-1">
              <input autoFocus type="number" step="0.01" value={fieldVal} onChange={e => setFieldVal(e.target.value)} placeholder="4.29"
                className="text-sm border border-gray-200 rounded px-2 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-navy" />
              <input value={rateNote} onChange={e => setRateNote(e.target.value)} placeholder="note (optional)"
                className="text-sm border border-gray-200 rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-navy" />
              <SmallBtn onClick={() => runField('rate', 'set_rate_override', Number(fieldVal), rateNote)} busyKey="rate">Save</SmallBtn>
              <button type="button" onClick={() => setEditField('')} className="text-xs text-gray-400 px-1">Cancel</button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {readiness.rateOverride != null && <SmallBtn onClick={() => runField('rate', 'clear_rate_override', null, null)} busyKey="rate">Clear</SmallBtn>}
              <SmallBtn onClick={() => { setEditField('rate'); setFieldVal(readiness.rateOverride != null ? String(readiness.rateOverride) : '') }} busyKey="_">Override</SmallBtn>
            </span>
          )}
        </Row>

        <Row label="Calls" ok value={`${readiness.calls} in window`} />
        <Row label="Emails" ok value={`${readiness.emails} linked`} />
      </div>

      {/* Generate control (the human action). Disabled ONLY without a target. */}
      {canGenerate && (
        <div className="mb-4">
          {!composing ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setComposing(true)} disabled={busy !== '' || !hasTarget}
                data-testid="lender-notes-generate"
                className="text-sm font-semibold bg-white border border-cool-300 text-navy rounded-lg px-3 py-1.5 hover:border-navy disabled:opacity-50">
                {draft ? 'Regenerate lender notes' : 'Generate lender notes'}
              </button>
              {!hasTarget && <span className="text-[11px] text-amber-700 font-body">Set the target lender first (the note opens with the lender by name).</span>}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <label className="block text-xs font-semibold font-body text-navy mb-1" htmlFor="advisor-context">Advisor context (optional)</label>
              <p className="text-[11px] text-gray-400 font-body mb-2">
                Your own notes about the deal (framing, corrections, what to lead with). Highest authority after the file&rsquo;s own data.
              </p>
              <textarea id="advisor-context" value={advisor} onChange={e => setAdvisor(e.target.value)} rows={3} maxLength={4000}
                disabled={busy !== ''}
                className="w-full text-sm font-body border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-navy"
                placeholder="e.g. Qualifying on the co-borrower only; lead with the reserves." />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => generate()} disabled={busy !== ''} data-testid="lender-notes-submit"
                  className="text-sm font-semibold bg-white border border-cool-300 text-navy rounded-lg px-3 py-1.5 hover:border-navy disabled:opacity-50">
                  {busy === 'generate' ? 'Generating…' : 'Generate draft'}
                </button>
                <button type="button" onClick={() => setComposing(false)} disabled={busy !== ''}
                  className="text-sm font-semibold text-gray-500 hover:text-navy px-2 py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-sm font-body text-red-700">{error}</p>}
      {/* Fresh Finmo pull failed; offer the explicit stale-snapshot second click
          (never silently stale). The readiness strip states the snapshot age. */}
      {staleOffer && (
        <div className="mb-3">
          <button type="button" onClick={() => generate(true)} disabled={busy !== ''} data-testid="lender-notes-stale-fallback"
            className="text-sm font-semibold bg-white border border-cool-300 text-navy rounded-lg px-3 py-1.5 hover:border-navy disabled:opacity-50">
            {busy === 'generate' ? 'Generating…' : `Generate from the snapshot ${hoursAgo(readiness.snapshotPulledAt)}`}
          </button>
          <span className="ml-2 text-[11px] text-gray-400 font-body">Uses the last pull, not the current Finmo data.</span>
        </div>
      )}
      {notice && <p className="mb-3 text-sm font-body text-amber-700">{notice}</p>}

      {draft ? (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-block text-[11px] font-bold uppercase tracking-wide bg-navy text-white rounded px-2 py-0.5">
              {initialDraft?.source === 'human_edited' && !dirty ? 'Edited draft' : 'Draft'}
            </span>
            <span className="text-[11px] text-gray-400 font-body">Nothing is sent. Copy it out when you are ready.</span>
            <span className={`text-[11px] font-body ml-auto ${over ? 'text-red-700 font-semibold' : 'text-gray-400'}`}>
              {count.toLocaleString('en-CA')} / {LENDER_NOTES_CEILING.toLocaleString('en-CA')}{over ? ' over ceiling' : ''}
            </span>
          </div>
          <textarea value={draft} onChange={e => { setDraft(e.target.value); setDirty(true) }} rows={20} data-testid="lender-notes-draft"
            className="w-full text-sm font-body text-gray-800 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-navy" />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={copy}
              className="text-sm font-semibold text-navy border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50" data-testid="lender-notes-copy">
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
            {canManage && (
              <button type="button" onClick={saveEdit} disabled={busy !== '' || !dirty} data-testid="lender-notes-save-edit"
                className="text-sm font-semibold text-navy border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">
                {busy === 'edit' ? 'Saving…' : savedEdit ? 'Saved' : 'Save edit'}
              </button>
            )}
            {dirty && <span className="text-[11px] text-gray-400 font-body">Unsaved edits. Copy works on what you see; Save edit keeps it in history.</span>}
          </div>
        </div>
      ) : (
        !composing && (
          <p className="text-sm text-gray-400 font-body">
            No draft yet. Generate one from the deal&rsquo;s own data; it lands here as an editable draft you can copy out.
          </p>
        )
      )}
    </div>
  )
}
