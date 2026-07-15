'use client'

// Generate Lender Notes — the deal-room card (lender-notes wiring session,
// 2026-07-15). Clicking the button opens an optional advisor-context field,
// then calls the workbench endpoint, which feeds the deal's own data through
// the proven lender-notes skill and lands a DRAFT. The result renders here as
// an editable draft, plainly labelled DRAFT, with copy, regenerate, and the
// character count against the 3750 ceiling. Nothing is sent anywhere; Michael
// copies it out himself.
//
// Lime is reserved for the human action (Generate / Regenerate), per the
// shell's attention rule; every other control is calm navy or gray. The
// surrounding UI chrome follows the client copy rules (no dashes); the DRAFT
// itself follows the skill's rules (semicolons permitted) and is model output.

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import { runLenderNotesGeneration, LENDER_NOTES_CEILING } from '@/lib/lender-notes-client'

export interface LenderNotesInitialDraft {
  generatedText: string
  charCount: number | null
  createdAt: string
  createdByEmail: string | null
}

export default function LenderNotesCard({
  dealId,
  initialDraft,
  canGenerate,
  demo,
}: {
  dealId: string
  initialDraft: LenderNotesInitialDraft | null
  canGenerate: boolean
  demo: boolean
}) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const [draft, setDraft] = useState<string>(initialDraft?.generatedText ?? '')
  const [advisor, setAdvisor] = useState('')
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = useCallback(async () => {
    setBusy(true)
    setError('')
    setCopied(false)
    const result = await runLenderNotesGeneration({
      dealId,
      advisorContext: advisor,
      demo,
      mintToken: mintGatesToken,
      gatesTokenHeader: GATES_TOKEN_HEADER,
    })
    if (result.ok && result.note) {
      setDraft(result.note)
      setComposing(false)
      // A real generation persisted a new draft; refresh so the server view
      // matches. In demo nothing was written, so there is nothing to refresh.
      if (!demo) router.refresh()
    } else {
      setError(result.message ?? 'Generation failed. Try again.')
    }
    setBusy(false)
  }, [dealId, advisor, demo, mintGatesToken, router])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to the clipboard. Select the text and copy it manually.')
    }
  }, [draft])

  const count = draft.length
  const over = count > LENDER_NOTES_CEILING

  if (!canGenerate && !draft) {
    return (
      <p className="text-sm text-gray-400 font-body">
        Submission notes are generated in the deal room. Your account does not hold the notes permission.
      </p>
    )
  }

  return (
    <div data-testid="lender-notes-card">
      {/* The generate / compose controls (the human action). */}
      {canGenerate && (
        <div className="mb-4">
          {!composing ? (
            <button
              type="button"
              onClick={() => setComposing(true)}
              disabled={busy}
              data-testid="lender-notes-generate"
              className="text-sm font-bold bg-lime text-navy rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {draft ? 'Regenerate lender notes' : 'Generate lender notes'}
            </button>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <label className="block text-xs font-semibold font-body text-navy mb-1" htmlFor="advisor-context">
                Advisor context (optional)
              </label>
              <p className="text-[11px] text-gray-400 font-body mb-2">
                Your own notes about the deal (framing, corrections, what to lead with). Highest authority after the
                file&rsquo;s own data. Leave blank to draft from the deal record alone.
              </p>
              <textarea
                id="advisor-context"
                value={advisor}
                onChange={e => setAdvisor(e.target.value)}
                rows={3}
                maxLength={4000}
                disabled={busy}
                className="w-full text-sm font-body border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-navy"
                placeholder="e.g. Qualifying on the co-borrower only; lead with the reserves."
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  data-testid="lender-notes-submit"
                  className="text-sm font-bold bg-lime text-navy rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Generating…' : 'Generate draft'}
                </button>
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  disabled={busy}
                  className="text-sm font-semibold text-gray-500 hover:text-navy px-2 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-sm font-body text-red-700">{error}</p>}

      {draft ? (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-block text-[11px] font-bold uppercase tracking-wide bg-navy text-white rounded px-2 py-0.5">
              Draft
            </span>
            <span className="text-[11px] text-gray-400 font-body">Nothing is sent. Copy it out when you are ready.</span>
            <span className={`text-[11px] font-body ml-auto ${over ? 'text-red-700 font-semibold' : 'text-gray-400'}`}>
              {count.toLocaleString('en-CA')} / {LENDER_NOTES_CEILING.toLocaleString('en-CA')}
              {over ? ' over ceiling' : ''}
            </span>
          </div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={20}
            data-testid="lender-notes-draft"
            className="w-full text-sm font-body text-gray-800 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap focus:outline-none focus:ring-1 focus:ring-navy"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="text-sm font-semibold text-navy border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
              data-testid="lender-notes-copy"
            >
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
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
