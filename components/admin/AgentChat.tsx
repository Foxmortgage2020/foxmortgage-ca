'use client'

// Ask Fox chat (Agent session). Mobile-first streaming chat over the
// NDJSON turn stream, with confirm cards rendered in-thread: the exact
// payload, a confirm tap that executes it through the confirmed-action
// route, and the executed or dismissed state visible afterward. Two
// one-tap modes ride on top: Call Prep (from a deal room link or the prep
// bar) and Call Review (paste or upload a transcript; the Dialpad CSV
// shape parses client-side into a speaker-labeled transcript).
//
// The browser mints a gates token per send (same azp posture as the
// desk) so the server's knowledge reads work; mint failure degrades to
// the honest states server-side.

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import { parseTranscript } from '@/lib/agent/transcript'
import { AGENT_MAX_INPUT_CHARS } from '@/config/agent'
import type { AgentCardRow, AgentMessageRow } from '@/lib/agent/store'

interface CardState {
  id: string
  kind: 'zoho_update' | 'task_create'
  payload: Record<string, unknown>
  reason: string | null
  status: 'proposed' | 'executed' | 'dismissed'
  result: Record<string, unknown> | null
}

interface ToolRun {
  label: string
  status: 'running' | 'ok' | 'failed'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolRuns: ToolRun[]
  cards: CardState[]
  error: string | null
}

export interface AgentChatInitial {
  conversationId: string | null
  messages: AgentMessageRow[]
  cards: AgentCardRow[]
  capped: boolean
  storeConfigured: boolean
  agentConfigured: boolean
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    find_client: 'reading Zoho',
    get_deal_file: 'reading the workbench file',
    search_rates: 'searching the approved book',
    knowledge_lookup: 'reading lender knowledge',
    get_open_tasks: 'checking open tasks',
    propose_zoho_update: 'drafting a CRM update card',
    propose_task: 'drafting a task card',
  }
  return labels[name] ?? name
}

// In-thread indicator from submit to first token. The dots animate only
// where motion is welcome; prefers-reduced-motion gets the static form.
function ThinkingIndicator() {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-gray-400"
      role="status"
      aria-label="Ask Fox is working"
      data-testid="thinking-indicator"
    >
      <span className="text-xs font-body motion-safe:hidden">Working…</span>
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="hidden motion-safe:inline-block w-1.5 h-1.5 rounded-full bg-navy/40 animate-bounce"
          style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  )
}

export default function AgentChat({
  initial,
  canExecute,
}: {
  initial: AgentChatInitial
  canExecute: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const mintToken = useGatesToken()

  const [conversationId, setConversationId] = useState<string | null>(initial.conversationId)
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initial.messages.map(m => ({
      role: m.role,
      content: m.content,
      toolRuns:
        m.role === 'assistant' && m.tool_calls.length > 0
          ? m.tool_calls.map(
              (t): ToolRun => ({ label: toolLabel(t.name), status: t.ok ? 'ok' : 'failed' }),
            )
          : [],
      cards: initial.cards
        .filter(c => c.turn_seq === m.seq)
        .map(c => ({
          id: c.id,
          kind: c.kind,
          payload: c.payload,
          reason: c.reason,
          status: c.status,
          result: c.result,
        })),
      error: null,
    })),
  )
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [capped, setCapped] = useState(initial.capped)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewText, setReviewText] = useState('')
  const [cardBusy, setCardBusy] = useState<Record<string, boolean>>({})
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoSentRef = useRef(false)

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }, [])

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim()
      if (!trimmed || streaming || capped) return
      setStreaming(true)
      setMessages(prev => [
        ...prev,
        { role: 'user', content: trimmed, toolRuns: [], cards: [], error: null },
        { role: 'assistant', content: '', toolRuns: [], cards: [], error: null },
      ])
      scrollDown()

      const patchDraft = (fn: (draft: ChatMessage) => ChatMessage) => {
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = fn(next[next.length - 1])
          return next
        })
      }

      try {
        const token = await mintToken().catch(() => null)
        const res = await fetch('/api/portal/admin/agent/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { [GATES_TOKEN_HEADER]: token } : {}),
          },
          body: JSON.stringify({ conversationId, message: trimmed }),
        })
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { message?: string; capped?: boolean } | null
          if (body?.capped) setCapped(true)
          patchDraft(d => ({ ...d, error: body?.message ?? `The request failed (HTTP ${res.status}).` }))
          setStreaming(false)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let idx: number
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            if (!line) continue
            let event: any
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }
            if (event.type === 'meta' && typeof event.conversationId === 'string') {
              setConversationId(event.conversationId)
              const params = new URLSearchParams(window.location.search)
              params.set('c', event.conversationId)
              params.delete('prep')
              params.delete('q')
              router.replace(`${pathname}?${params.toString()}`, { scroll: false })
            } else if (event.type === 'text' && typeof event.delta === 'string') {
              patchDraft(d => ({ ...d, content: d.content + event.delta }))
              scrollDown()
            } else if (event.type === 'tool' && event.status === 'running') {
              patchDraft(d => ({
                ...d,
                toolRuns: [...d.toolRuns, { label: toolLabel(event.name), status: 'running' }],
              }))
              scrollDown()
            } else if (event.type === 'tool') {
              patchDraft(d => {
                const runs = [...d.toolRuns]
                const label = toolLabel(event.name)
                for (let j = runs.length - 1; j >= 0; j--) {
                  if (runs[j].status === 'running' && runs[j].label === label) {
                    runs[j] = { label, status: event.status === 'failed' ? 'failed' : 'ok' }
                    return { ...d, toolRuns: runs }
                  }
                }
                return { ...d, toolRuns: [...runs, { label, status: event.status === 'failed' ? 'failed' : 'ok' }] }
              })
            } else if (event.type === 'card' && event.card) {
              patchDraft(d => ({
                ...d,
                cards: [...d.cards, { ...event.card, result: null }],
              }))
              scrollDown()
            } else if (event.type === 'error' && typeof event.message === 'string') {
              patchDraft(d => ({ ...d, error: event.message }))
            } else if (event.type === 'capped') {
              setCapped(true)
            }
          }
        }
      } catch {
        patchDraft(d => ({ ...d, error: 'The connection dropped mid-reply. The turn is still in the log; reload to see it.' }))
      } finally {
        setStreaming(false)
        scrollDown()
      }
    },
    [capped, conversationId, mintToken, pathname, router, scrollDown, streaming],
  )

  // One-tap prep: /portal/admin/agent?prep=<file ref or client name>
  // Search hand-off: /portal/admin/agent?q=<question> — the command palette
  // hands anything it cannot resolve to Ask Fox as a question.
  useEffect(() => {
    if (autoSentRef.current) return
    const params = new URLSearchParams(window.location.search)
    const prep = params.get('prep')
    const q = params.get('q')
    if (prep && !initial.conversationId) {
      autoSentRef.current = true
      void send(`Prep a call for ${prep}.`)
    } else if (q && q.trim() && !initial.conversationId) {
      autoSentRef.current = true
      void send(q.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function decideCard(cardId: string, action: 'execute' | 'dismiss') {
    setCardBusy(b => ({ ...b, [cardId]: true }))
    setCardErrors(e => {
      const next = { ...e }
      delete next[cardId]
      return next
    })
    try {
      const res = await fetch(`/api/portal/admin/agent/cards/${cardId}/${action}`, { method: 'POST' })
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean
        message?: string
        result?: Record<string, unknown>
        status?: string
      } | null
      if (res.ok && body?.ok) {
        setMessages(prev =>
          prev.map(m => ({
            ...m,
            cards: m.cards.map(c =>
              c.id === cardId
                ? { ...c, status: action === 'execute' ? 'executed' : 'dismissed', result: body.result ?? null }
                : c,
            ),
          })),
        )
      } else if (res.status === 409 && body?.status) {
        setMessages(prev =>
          prev.map(m => ({
            ...m,
            cards: m.cards.map(c =>
              c.id === cardId ? { ...c, status: body.status as CardState['status'] } : c,
            ),
          })),
        )
        setCardErrors(e => ({ ...e, [cardId]: 'Already decided in another tab; state refreshed.' }))
      } else {
        setCardErrors(e => ({ ...e, [cardId]: body?.message ?? `The request failed (HTTP ${res.status}).` }))
      }
    } catch {
      setCardErrors(e => ({ ...e, [cardId]: 'Could not reach the server. The card stays pending.' }))
    } finally {
      setCardBusy(b => ({ ...b, [cardId]: false }))
    }
  }

  function submitReview() {
    const parsed = parseTranscript(reviewText)
    if (!parsed.normalized) return
    const body = `Review this call transcript against the rubric.\n\nTranscript (${parsed.kind === 'csv' ? 'parsed from a CSV export' : 'pasted text'}):\n${parsed.normalized}`
    if (body.length > AGENT_MAX_INPUT_CHARS) {
      setCardErrors(e => ({ ...e, review: 'That transcript is too long for one message. Trim it and retry.' }))
      return
    }
    setReviewOpen(false)
    setReviewText('')
    void send(body)
  }

  function onReviewFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setReviewText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  if (!initial.storeConfigured) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 mt-6">
        <p className="text-sm text-gray-500 font-body">
          The conversation store is not configured (FOXCA_SUPABASE_URL and FOXCA_SUPABASE_KEY), and
          Ask Fox will not run unlogged. Set the store first.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 180px)', minHeight: 420 }}>
      {!initial.agentConfigured && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-body">
            Ask Fox is not configured yet: add ANTHROPIC_API_KEY (and optionally AGENT_MODEL) to the
            Vercel project, then reload. The chat records and answers nothing until then.
          </p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setInput('Prep a call for ')}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-gray-300 text-navy hover:border-navy"
          data-testid="prep-button"
        >
          Prep a call
        </button>
        <button
          onClick={() => setReviewOpen(o => !o)}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-gray-300 text-navy hover:border-navy"
          data-testid="review-button"
        >
          Review a call
        </button>
        <Link
          href="/portal/admin/agent/history"
          className="ml-auto text-xs font-semibold text-navy underline hover:text-lime"
        >
          History
        </Link>
      </div>

      {/* Call Review panel */}
      {reviewOpen && (
        <div className="mb-3 bg-white border border-gray-200 rounded-xl p-4" data-testid="review-panel">
          <p className="text-xs font-body text-gray-500 mb-2">
            Paste the transcript or upload the Dialpad CSV export. It parses locally into a
            speaker-labeled transcript before it sends.
          </p>
          <textarea
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            rows={6}
            placeholder="Paste the transcript or CSV here"
            className="w-full text-sm font-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50 resize-y"
            data-testid="review-textarea"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-gray-300 text-navy cursor-pointer hover:border-navy">
              Upload CSV or text
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) onReviewFile(f)
                }}
              />
            </label>
            <button
              onClick={submitReview}
              disabled={!reviewText.trim() || streaming || capped}
              className="text-xs font-bold px-3 py-2 rounded-lg bg-navy text-white disabled:opacity-50"
              data-testid="review-submit"
            >
              Grade this call
            </button>
            {cardErrors.review && <p className="text-xs text-red-600 font-body">{cardErrors.review}</p>}
          </div>
        </div>
      )}

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4" data-testid="agent-thread">
        {messages.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-body text-gray-600">
              Ask about a client, a rate, or a lender, and every number comes back with its source.
              Try &quot;frame my renewal conversation with Nick Aitken&quot;, tap Prep a call, or
              paste a transcript into Review a call.
            </p>
            <p className="text-xs font-body text-gray-400 mt-2">
              Reads are live and scoped to the practice. CRM changes only happen through confirm
              cards you tap. Decisions stay on the Approvals desk. Every conversation is kept.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] bg-navy text-white rounded-2xl rounded-br-md px-4 py-2.5'
                  : 'max-w-full bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3'
              }
            >
              {m.role === 'assistant' && m.toolRuns.length > 0 && (
                <p className="text-[11px] font-body mb-1.5">
                  {m.toolRuns.map((r, j) => (
                    <span key={j}>
                      {j > 0 && <span className="text-gray-300"> · </span>}
                      <span
                        className={
                          r.status === 'running'
                            ? 'text-navy/70 motion-safe:animate-pulse'
                            : 'text-gray-400'
                        }
                        data-testid={r.status === 'running' ? 'tool-running' : undefined}
                      >
                        {r.label}
                        {r.status === 'running' ? '…' : r.status === 'failed' ? ' (failed)' : ''}
                      </span>
                    </span>
                  ))}
                </p>
              )}
              <div
                className={`text-sm font-body whitespace-pre-wrap break-words ${
                  m.role === 'user' ? 'text-white' : 'text-gray-800'
                }`}
              >
                {m.role === 'assistant' && !m.content && streaming && i === messages.length - 1 ? (
                  <ThinkingIndicator />
                ) : (
                  m.content
                )}
              </div>
              {m.cards.map(card => (
                <ConfirmCard
                  key={card.id}
                  card={card}
                  canExecute={canExecute}
                  busy={Boolean(cardBusy[card.id])}
                  error={cardErrors[card.id]}
                  onExecute={() => void decideCard(card.id, 'execute')}
                  onDismiss={() => void decideCard(card.id, 'dismiss')}
                />
              ))}
              {m.error && (
                <p className="mt-2 text-xs font-body text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  {m.error}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      {capped ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-600 font-body">
            This thread reached its message limit and is closed. It stays in the history.
          </p>
          <Link
            href="/portal/admin/agent"
            className="inline-block mt-2 text-xs font-bold bg-navy text-white rounded-lg px-3 py-2"
          >
            Start a new thread
          </Link>
        </div>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault()
            const value = input
            setInput('')
            void send(value)
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const value = input
                setInput('')
                void send(value)
              }
            }}
            rows={2}
            placeholder={streaming ? 'Working…' : 'Ask about a client, a rate, a lender'}
            disabled={streaming}
            className="flex-1 text-sm font-body border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-navy/50 resize-none bg-white disabled:opacity-60"
            data-testid="agent-input"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold bg-lime text-navy disabled:opacity-50"
            data-testid="agent-send"
          >
            {streaming ? '…' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )
}

// ─── Confirm card ────────────────────────────────────────────────────────────

function ConfirmCard({
  card,
  canExecute,
  busy,
  error,
  onExecute,
  onDismiss,
}: {
  card: CardState
  canExecute: boolean
  busy: boolean
  error?: string
  onExecute: () => void
  onDismiss: () => void
}) {
  const [armed, setArmed] = useState(false)
  const p = card.payload as Record<string, any>
  const title =
    card.kind === 'zoho_update'
      ? `Update ${p.record_label ?? p.record_id} (${p.module})`
      : `Create task: ${p.subject}`
  return (
    <div
      className={`mt-3 border-2 rounded-xl p-3 ${
        card.status === 'executed'
          ? 'border-green-300 bg-green-50'
          : card.status === 'dismissed'
            ? 'border-gray-200 bg-gray-50'
            : 'border-navy/30 bg-lime/10'
      }`}
      data-testid={`card-${card.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-navy">
          {card.kind === 'zoho_update' ? 'CRM update' : 'Task'}
        </span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            card.status === 'executed'
              ? 'bg-green-100 text-green-700'
              : card.status === 'dismissed'
                ? 'bg-gray-200 text-gray-600'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {card.status === 'proposed' ? 'awaiting confirm' : card.status}
        </span>
      </div>
      <p className="text-sm font-body font-semibold text-navy mt-1.5">{title}</p>
      {card.kind === 'zoho_update' && p.fields && (
        <div className="mt-1 space-y-0.5">
          {Object.entries(p.fields as Record<string, unknown>).map(([k, v]) => (
            <p key={k} className="text-xs font-body text-gray-700">
              <span className="text-gray-400">{k}:</span> {String(v)}
            </p>
          ))}
        </div>
      )}
      {card.kind === 'task_create' && (
        <div className="mt-1 space-y-0.5 text-xs font-body text-gray-700">
          {p.due_date && <p><span className="text-gray-400">due:</span> {p.due_date}</p>}
          {p.priority && <p><span className="text-gray-400">priority:</span> {p.priority}</p>}
          {p.related_deal_label && <p><span className="text-gray-400">linked to:</span> {p.related_deal_label}</p>}
          {p.description && <p className="text-gray-600 whitespace-pre-wrap">{String(p.description).slice(0, 400)}</p>}
        </div>
      )}
      {card.reason && <p className="text-[11px] text-gray-500 font-body mt-1.5">Why: {card.reason}</p>}
      {card.status === 'executed' && card.result && (
        <p className="text-xs font-body text-green-800 mt-1.5">
          Done{typeof card.result.task_id === 'string' ? `, task ${card.result.task_id}` : ', written to Zoho'}.
        </p>
      )}
      {card.status === 'proposed' &&
        (canExecute ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (armed) {
                  setArmed(false)
                  onExecute()
                } else {
                  setArmed(true)
                  window.setTimeout(() => setArmed(false), 4000)
                }
              }}
              disabled={busy}
              className={`text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50 ${
                armed ? 'bg-navy text-white' : 'bg-lime text-navy'
              }`}
              data-testid={`confirm-${card.id}`}
            >
              {busy ? 'Working…' : armed ? 'Tap again to confirm' : 'Confirm'}
            </button>
            <button
              onClick={onDismiss}
              disabled={busy}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-600 disabled:opacity-50"
              data-testid={`dismiss-${card.id}`}
            >
              Dismiss
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 font-body mt-2">Executing needs the admin role.</p>
        ))}
      {error && <p className="text-xs text-red-600 font-body mt-1.5">{error}</p>}
    </div>
  )
}
