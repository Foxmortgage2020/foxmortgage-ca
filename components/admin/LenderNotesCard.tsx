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
  runLenderNotesCrmWrite, LENDER_NOTES_CEILING,
  type SubmissionActionName, type CrmWriteResult,
} from '@/lib/lender-notes-client'

// Two-tap arm window, enforced by timestamp at tap time (never by the timer
// alone) so a throttled background tab cannot leave the write button armed.
const ARM_WINDOW_MS = 4000

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
  canCrmWrite,
  crmLinked,
  crmConfigured,
  demo,
}: {
  dealId: string
  initialDraft: LenderNotesInitialDraft | null
  readiness: LenderNotesReadiness
  canGenerate: boolean
  canManage: boolean
  /** notes.crm.write: run the generator against the Zoho file (N-06). */
  canCrmWrite: boolean
  /** The room carries a Zoho file or a Finmo application to write against. */
  crmLinked: boolean
  /** The bridge to the generator is wired on this deployment. */
  crmConfigured: boolean
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
  // The Zoho write (N-06). Its result is kept apart from the draft above: the
  // two are different notes from different engines, and merging them would let
  // a preview read as the saved draft.
  const [crmResult, setCrmResult] = useState<CrmWriteResult | null>(null)
  const [crmError, setCrmError] = useState('')
  const [armedAt, setArmedAt] = useState<number | null>(null)

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

  // The Zoho write. A preview is the identical call with dry_run, so what the
  // preview shows is what a write would put on the file.
  const runCrm = useCallback(async (dryRun: boolean, force = false) => {
    setBusy(dryRun ? 'crm-preview' : 'crm-write')
    setCrmError(''); setCrmResult(null); setArmedAt(null)
    const result = await runLenderNotesCrmWrite({ dealId, dryRun, force, demo })
    if (result.ok) {
      setCrmResult(result)
      // A real write changes the file, so the room re-reads.
      if (!dryRun && !demo && !result.skippedRecent) router.refresh()
    } else {
      setCrmResult(result.writes || result.errors ? result : null)
      setCrmError(result.message ?? 'The generator failed. Nothing is confirmed written.')
    }
    setBusy('')
  }, [dealId, demo, router])

  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { setError('Could not copy to the clipboard. Select the text and copy it manually.') }
  }, [draft])

  const count = draft.length
  const over = count > LENDER_NOTES_CEILING
  const hasTarget = Boolean(readiness.targetLender)

  if (!canGenerate && !draft) {
    return (
      <p className="text-sm text-cool-500 font-ui">
        Submission notes are generated in the deal room. Your account does not hold the notes permission.
      </p>
    )
  }

  // ── Readiness strip row ──
  const Row = ({ label, ok, value, children }: { label: string; ok: boolean; value: string; children?: React.ReactNode }) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 border-b border-cool-50 last:border-0">
      <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-navy' : 'bg-amber-400'}`} aria-hidden />
      <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-600 w-28">{label}</span>
      <span className={`text-sm font-ui tabular-nums ${ok ? 'text-navy' : 'text-amber-700'}`}>{value}</span>
      {canManage && <span className="ml-auto flex items-center gap-2">{children}</span>}
    </div>
  )
  const SmallBtn = ({ onClick, children, busyKey }: { onClick: () => void; children: React.ReactNode; busyKey: string }) => (
    <button type="button" onClick={onClick} disabled={busy !== ''} className="text-xs font-semibold text-navy border border-cool-200 rounded-lg px-2 py-1 hover:bg-cool-50 disabled:opacity-50">
      {busy === busyKey ? '…' : children}
    </button>
  )

  return (
    <div data-testid="lender-notes-card">
      {/* Readiness strip: what the note will be built from. */}
      <div className="mb-4 rounded-lg border border-cool-200 bg-cool-50/50 px-3 py-1.5" data-testid="lender-notes-readiness">
        <Row label="Application" ok={Boolean(readiness.snapshotPulledAt)} value={hoursAgo(readiness.snapshotPulledAt)}>
          {readiness.hasFinmoApp
            ? <SmallBtn onClick={pull} busyKey="pull">{readiness.snapshotPulledAt ? 'Re-pull' : 'Pull from Finmo'}</SmallBtn>
            : <span className="text-[11px] text-cool-500 font-ui">no Finmo file</span>}
        </Row>

        <Row label="Target lender" ok={hasTarget} value={readiness.targetLender ?? 'not set (required)'}>
          {editField === 'target' ? (
            <span className="flex items-center gap-1">
              <input autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)} placeholder="e.g. TD Mortgages"
                className="text-sm border border-cool-200 rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-navy" />
              <SmallBtn onClick={() => runField('target', 'set_target_lender', fieldVal, null)} busyKey="target">Save</SmallBtn>
              <button type="button" onClick={() => setEditField('')} className="text-xs text-cool-500 px-1">Cancel</button>
            </span>
          ) : (
            <SmallBtn onClick={() => { setEditField('target'); setFieldVal(readiness.targetLender ?? '') }} busyKey="_">{hasTarget ? 'Change' : 'Set'}</SmallBtn>
          )}
        </Row>

        <Row label="Insured status" ok={Boolean(readiness.insuredStatus)} value={readiness.insuredStatus ?? 'not set'}>
          {editField === 'insured' ? (
            <span className="flex items-center gap-1">
              <select autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
                className="text-sm border border-cool-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-navy">
                <option value="">choose…</option>
                <option value="insured">insured</option>
                <option value="insurable">insurable</option>
                <option value="uninsured">uninsured</option>
              </select>
              <SmallBtn onClick={() => runField('insured', 'set_insured_status', fieldVal, null)} busyKey="insured">Save</SmallBtn>
              <button type="button" onClick={() => setEditField('')} className="text-xs text-cool-500 px-1">Cancel</button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {!readiness.insuredStatus && readiness.platformInsuredSuggestion && (
                <span className="text-[11px] text-cool-500 font-ui italic">platform reads: {readiness.platformInsuredSuggestion}</span>
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
                className="text-sm border border-cool-200 rounded px-2 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-navy" />
              <input value={rateNote} onChange={e => setRateNote(e.target.value)} placeholder="note (optional)"
                className="text-sm border border-cool-200 rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-navy" />
              <SmallBtn onClick={() => runField('rate', 'set_rate_override', Number(fieldVal), rateNote)} busyKey="rate">Save</SmallBtn>
              <button type="button" onClick={() => setEditField('')} className="text-xs text-cool-500 px-1">Cancel</button>
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
              {!hasTarget && <span className="text-[11px] text-amber-700 font-ui">Set the target lender first (the note opens with the lender by name).</span>}
            </div>
          ) : (
            <div className="rounded-lg border border-cool-200 bg-white p-3">
              <label className="block font-heading text-xs font-semibold text-navy mb-1" htmlFor="advisor-context">Advisor context (optional)</label>
              <p className="text-[11px] text-cool-500 font-ui mb-2">
                Your own notes about the deal (framing, corrections, what to lead with). Highest authority after the file&rsquo;s own data.
              </p>
              <textarea id="advisor-context" value={advisor} onChange={e => setAdvisor(e.target.value)} rows={3} maxLength={4000}
                disabled={busy !== ''}
                className="w-full text-sm font-ui border border-cool-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-navy"
                placeholder="e.g. Qualifying on the co-borrower only; lead with the reserves." />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => generate()} disabled={busy !== ''} data-testid="lender-notes-submit"
                  className="text-sm font-semibold bg-white border border-cool-300 text-navy rounded-lg px-3 py-1.5 hover:border-navy disabled:opacity-50">
                  {busy === 'generate' ? 'Generating…' : 'Generate draft'}
                </button>
                <button type="button" onClick={() => setComposing(false)} disabled={busy !== ''}
                  className="text-sm font-semibold text-cool-500 hover:text-navy px-2 py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-sm font-ui text-red-700">{error}</p>}
      {/* Fresh Finmo pull failed; offer the explicit stale-snapshot second click
          (never silently stale). The readiness strip states the snapshot age. */}
      {staleOffer && (
        <div className="mb-3">
          <button type="button" onClick={() => generate(true)} disabled={busy !== ''} data-testid="lender-notes-stale-fallback"
            className="text-sm font-semibold bg-white border border-cool-300 text-navy rounded-lg px-3 py-1.5 hover:border-navy disabled:opacity-50">
            {busy === 'generate' ? 'Generating…' : `Generate from the snapshot ${hoursAgo(readiness.snapshotPulledAt)}`}
          </button>
          <span className="ml-2 text-[11px] text-cool-500 font-ui">Uses the last pull, not the current Finmo data.</span>
        </div>
      )}
      {notice && <p className="mb-3 text-sm font-ui text-amber-700">{notice}</p>}

      {draft ? (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-block text-[11px] font-bold uppercase tracking-wide bg-navy text-white rounded px-2 py-0.5">
              {initialDraft?.source === 'human_edited' && !dirty ? 'Edited draft' : 'Draft'}
            </span>
            <span className="text-[11px] text-cool-500 font-ui">Nothing is sent. Copy it out when you are ready.</span>
            <span className={`text-[11px] font-ui ml-auto tabular-nums ${over ? 'text-red-700 font-semibold' : 'text-cool-500'}`}>
              {count.toLocaleString('en-CA')} / {LENDER_NOTES_CEILING.toLocaleString('en-CA')}{over ? ' over ceiling' : ''}
            </span>
          </div>
          <textarea value={draft} onChange={e => { setDraft(e.target.value); setDirty(true) }} rows={20} data-testid="lender-notes-draft"
            className="w-full text-sm font-ui text-cool-800 border border-cool-200 rounded-lg p-3 whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-navy" />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={copy}
              className="text-sm font-semibold text-navy border border-cool-200 rounded-lg px-3 py-1.5 hover:bg-cool-50" data-testid="lender-notes-copy">
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
            {canManage && (
              <button type="button" onClick={saveEdit} disabled={busy !== '' || !dirty} data-testid="lender-notes-save-edit"
                className="text-sm font-semibold text-navy border border-cool-200 rounded-lg px-3 py-1.5 hover:bg-cool-50 disabled:opacity-40">
                {busy === 'edit' ? 'Saving…' : savedEdit ? 'Saved' : 'Save edit'}
              </button>
            )}
            {dirty && <span className="text-[11px] text-cool-500 font-ui">Unsaved edits. Copy works on what you see; Save edit keeps it in history.</span>}
          </div>
        </div>
      ) : (
        !composing && (
          <p className="text-sm text-cool-500 font-ui">
            No draft yet. Generate one from the deal&rsquo;s own data; it lands here as an editable draft you can copy out.
          </p>
        )
      )}

      {/* ── Write to the Zoho file (N-06, 2026-07-29) ─────────────────────────
          The native Lender Notes Generator, which replaced the n8n workflow of
          the same name. Deliberately separate from the draft above: a different
          engine, a different output, and a real consequence, because this one
          overwrites Lender_Notes on the CRM record of truth. Hidden in demo,
          where no control that writes is ever offered. */}
      {canCrmWrite && !demo && (
        <div className="mt-6 pt-4 border-t border-cool-200" data-testid="lender-notes-crm">
          <h4 className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-600">
            Write to the Zoho file
          </h4>
          <p className="mt-1 text-[11px] text-cool-500 font-ui">
            Runs the generator against the CRM file and puts the result in Lender Notes on the Deal. Whatever is
            there now is copied to a history note first, and a log note records the run. Preview shows the exact
            text without writing anything.
          </p>

          {!crmConfigured ? (
            <p className="mt-2 text-sm font-ui text-amber-700" data-testid="lender-notes-crm-unconfigured">
              The generator is not connected on this deployment, so the button would have nowhere to send the run.
            </p>
          ) : !crmLinked ? (
            <p className="mt-2 text-sm font-ui text-amber-700">
              This room carries no Zoho file and no Finmo application, so there is nothing to write to.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => runCrm(true)} disabled={busy !== ''}
                data-testid="lender-notes-crm-preview"
                className="text-sm font-semibold text-navy border border-cool-200 rounded-lg px-3 py-1.5 hover:bg-cool-50 disabled:opacity-50">
                {busy === 'crm-preview' ? 'Previewing…' : 'Preview without writing'}
              </button>
              <button type="button" disabled={busy !== ''}
                data-testid="lender-notes-crm-write"
                onClick={() => {
                  // Enforced by timestamp at tap time, never by the timer
                  // alone: a stale arm re-arms rather than writing.
                  if (armedAt !== null && Date.now() - armedAt <= ARM_WINDOW_MS) { runCrm(false); return }
                  setArmedAt(Date.now())
                  setTimeout(() => setArmedAt(null), ARM_WINDOW_MS)
                }}
                className={`text-sm font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50 ${
                  armedAt !== null ? 'bg-navy text-white' : 'bg-white border border-cool-300 text-navy hover:border-navy'
                }`}>
                {busy === 'crm-write' ? 'Writing…' : armedAt !== null ? 'Tap again to write' : 'Write to the file'}
              </button>
              {armedAt !== null && busy === '' && (
                <span className="text-[11px] text-cool-500 font-ui">This overwrites Lender Notes on the Deal.</span>
              )}
            </div>
          )}

          {crmError && (
            <p className="mt-2 text-sm font-ui text-red-700" data-testid="lender-notes-crm-error">{crmError}</p>
          )}

          {crmResult?.skippedRecent && (
            <div className="mt-2">
              <p className="text-sm font-ui text-amber-700">
                Skipped. A note was written to this file under 10 minutes ago.
              </p>
              <button type="button" onClick={() => runCrm(false, true)} disabled={busy !== ''}
                data-testid="lender-notes-crm-force"
                className="mt-1 text-sm font-semibold text-navy border border-cool-200 rounded-lg px-3 py-1.5 hover:bg-cool-50 disabled:opacity-50">
                {busy === 'crm-write' ? 'Writing…' : 'Write anyway'}
              </button>
            </div>
          )}

          {crmResult && !crmResult.skippedRecent && (
            <div className="mt-3" data-testid="lender-notes-crm-result">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-block text-[11px] font-bold uppercase tracking-wide rounded px-2 py-0.5 ${
                  crmResult.dryRun ? 'bg-cool-100 text-cool-700' : 'bg-navy text-white'
                }`}>
                  {crmResult.dryRun ? 'Preview' : 'Written'}
                </span>
                <span className="text-[11px] text-cool-500 font-ui">
                  {crmResult.dryRun
                    ? 'Nothing was written to the file.'
                    : `Lender Notes updated on ${crmResult.dealName ?? 'the file'}.`}
                </span>
              </div>

              {/* Exactly which of the three writes landed, as the engine
                  reported them. A partial run says so rather than reading
                  as a clean success. */}
              {!crmResult.dryRun && crmResult.writes && (
                <p className="mt-1 text-[11px] text-cool-500 font-ui">
                  History note {crmResult.writes.history_note ? 'written' : 'not written'}. Lender Notes{' '}
                  {crmResult.writes.lender_notes ? 'updated' : 'not updated'}. Log note{' '}
                  {crmResult.writes.log_note ? 'written' : 'not written'}.
                </p>
              )}

              {crmResult.errors && crmResult.errors.length > 0 && (
                <ul className="mt-1 text-[11px] text-red-700 font-ui list-disc pl-4">
                  {crmResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {crmResult.engineNotes && crmResult.engineNotes.length > 0 && (
                <ul className="mt-1 text-[11px] text-cool-500 font-ui list-disc pl-4">
                  {crmResult.engineNotes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}

              {crmResult.note && (
                <pre className="mt-2 text-sm font-ui text-cool-800 bg-cool-50 border border-cool-200 rounded-lg p-3 whitespace-pre-wrap break-words max-h-96 overflow-y-auto"
                  data-testid="lender-notes-crm-note">{crmResult.note}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
