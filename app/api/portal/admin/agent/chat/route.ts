// POST /api/portal/admin/agent/chat (Agent session): one Ask Fox turn,
// streamed as newline-delimited JSON events ({type:'meta'|'text'|'tool'|
// 'card'|'error'|'done'}). The route persists the user message before the
// model runs and the assistant message with its tool log after, so the
// conversation is a supervision artifact even when the stream drops.
// Gated by agent.use; the browser-minted gates token rides x-gates-token
// for the knowledge reads exactly like the desk.

import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail } from '@/lib/underwriting'
import {
  AGENT_HISTORY_MESSAGES,
  AGENT_MAX_INPUT_CHARS,
} from '@/config/agent'
import { conversationCappedCopy, conversationHasRoom } from '@/lib/agent/limits'
import { runAgentTurn, type HistoryTurn } from '@/lib/agent/loop'
import type { AgentToolContext } from '@/lib/agent/tools'
import {
  agentStoreConfigured,
  appendMessage,
  createConversation,
  getConversation,
  listMessages,
  setConversationStatus,
} from '@/lib/agent/store'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const gate = await apiPermission('agent.use')
  if (!gate.ok) {
    return Response.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  const user = gate.user

  // Demo mode (Session 9): short-circuit to a single clearly-labeled canned
  // reply. No Anthropic call, no tools, no conversation store — the NDJSON
  // shape matches what AgentChat parses (meta → text delta → done).
  if (isDemoMode()) {
    const encoder = new TextEncoder()
    const demoText =
      "[Demo] I'd normally pull this from Zoho and the workbench — in demo mode I'm showing a sample answer."
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        send({ type: 'meta', conversationId: 'demo', turnSeq: 1 })
        send({ type: 'text', delta: demoText })
        send({ type: 'done', conversationId: 'demo' })
        controller.close()
      },
    })
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
        'x-conversation-id': 'demo',
      },
    })
  }

  const body = (await req.json().catch(() => null)) as {
    conversationId?: string
    message?: string
  } | null
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return Response.json({ ok: false, message: 'Send a message.' }, { status: 422 })
  }
  if (message.length > AGENT_MAX_INPUT_CHARS) {
    return Response.json(
      { ok: false, message: `That message is too long (over ${AGENT_MAX_INPUT_CHARS.toLocaleString()} characters). Trim the paste and retry.` },
      { status: 422 },
    )
  }
  if (!agentStoreConfigured()) {
    return Response.json(
      { ok: false, message: 'The conversation store is not configured; Ask Fox will not run unlogged.' },
      { status: 503 },
    )
  }

  // Resolve or create the conversation, enforce the message cap, and
  // persist the user message BEFORE the model sees it.
  let conversationId =
    typeof body?.conversationId === 'string' && UUID_RE.test(body.conversationId)
      ? body.conversationId
      : null
  let history: HistoryTurn[] = []
  if (conversationId) {
    const conv = await getConversation(conversationId)
    if (!conv.configured || !conv.ok || !conv.data) {
      return Response.json({ ok: false, message: 'That conversation was not found.' }, { status: 404 })
    }
    if (conv.data.status === 'capped' || !conversationHasRoom(conv.data.message_count)) {
      if (conv.data.status !== 'capped') {
        await setConversationStatus(conversationId, 'capped', user.email)
      }
      return Response.json({ ok: false, capped: true, message: conversationCappedCopy() }, { status: 409 })
    }
    const msgs = await listMessages(conversationId)
    if (msgs.configured && msgs.ok) {
      history = msgs.data.slice(-AGENT_HISTORY_MESSAGES).map(m => ({
        role: m.role,
        content: m.content,
      }))
    }
  } else {
    const title = message.replace(/\s+/g, ' ').slice(0, 80)
    const created = await createConversation(title, user.email, user.userId)
    if (!created.configured || !created.ok) {
      return Response.json(
        { ok: false, message: 'Could not open a conversation record; Ask Fox will not run unlogged.' },
        { status: 503 },
      )
    }
    conversationId = created.data
  }

  const userSeq = await appendMessage({
    conversationId,
    role: 'user',
    content: message,
    toolCalls: [],
    actor: user.email,
  })
  if (!userSeq.configured || !userSeq.ok) {
    return Response.json(
      { ok: false, message: 'Could not record the message; Ask Fox will not run unlogged.' },
      { status: 503 },
    )
  }
  const turnSeq = userSeq.data + 1

  // Tenant anchor and the forwarded knowledge token.
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const workbenchAgentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const gatesToken = req.headers.get('x-gates-token')

  const encoder = new TextEncoder()
  const convId = conversationId
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          // Client went away; the turn still persists below.
        }
      }
      send({ type: 'meta', conversationId: convId, turnSeq })

      const ctx: AgentToolContext = {
        workbenchAgentId,
        gatesToken,
        conversationId: convId,
        turnSeq,
        viewerEmail: user.email,
        emitCard: card => send({ type: 'card', card }),
        memo: {},
      }

      const result = await runAgentTurn({
        history,
        userMessage: message,
        todayYMD: torontoTodayYMD(),
        ctx,
        emit: event => send(event),
      })

      // Persist the assistant turn with its tool log (the supervision
      // record), even when it errored mid-way.
      const content = result.text.trim() || (result.error ?? '(no reply)')
      await appendMessage({
        conversationId: convId,
        role: 'assistant',
        content,
        toolCalls: result.toolLog,
        actor: user.email,
      })

      // Mark capped once the NEXT turn would not fit, so the UI says so
      // now instead of failing later.
      const conv = await getConversation(convId)
      if (conv.configured && conv.ok && conv.data && !conversationHasRoom(conv.data.message_count)) {
        await setConversationStatus(convId, 'capped', user.email)
        send({ type: 'capped', message: conversationCappedCopy() })
      }

      send({ type: 'done', conversationId: convId })
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-conversation-id': conversationId,
    },
  })
}
