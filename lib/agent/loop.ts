// The Ask Fox agent loop (Agent session): a manual Anthropic Messages
// tool-use loop, streamed. Manual rather than the SDK tool runner because
// the product needs per-call budget enforcement, per-event streaming to
// the portal UI, and confirm-card side channels. Errors surface honestly
// in-stream ("the workbench read failed, here is what I have without it"),
// never as invented content.
//
// ANTHROPIC_API_KEY is a runtime product credential: server-side only,
// never client-exposed, set on Vercel via dashboard or REST. The build
// guardrail (never set it in build-session subprocesses) stands.

import Anthropic from '@anthropic-ai/sdk'
import { AGENT_MAX_OUTPUT_TOKENS, agentModel } from '@/config/agent'
import { MAX_TOOL_CALLS_PER_TURN } from '@/config/agent'
import { toolBudgetExhaustedNote, toolBudgetHasRoom } from '@/lib/agent/limits'
import { AGENT_SYSTEM_PROMPT, buildRuntimeContext } from '@/lib/agent/prompt'
import {
  AGENT_TOOLS,
  executeAgentTool,
  type AgentToolContext,
  type ToolExecution,
} from '@/lib/agent/tools'
import type { AgentToolCallLogEntry } from '@/lib/agent/store'

export function agentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

export type AgentStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; status: 'running' | 'ok' | 'failed'; summary?: string }
  | { type: 'error'; message: string }

export interface AgentTurnResult {
  text: string
  toolLog: AgentToolCallLogEntry[]
  /** Non-null when the turn ended on an error the user was told about. */
  error: string | null
}

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

// Injectable client factory so unit tests mock the API without network.
export type AnthropicFactory = () => Pick<Anthropic, 'messages'>

const defaultFactory: AnthropicFactory = () => new Anthropic()

// A reply we reached but could not read: the SDK (or a parse step) threw a
// JSON/syntax error rather than an API/transport error. Distinguished from
// "could not reach the model" so the copy is honest about what actually failed.
export function isUnreadableReplyError(err: unknown): boolean {
  if (err instanceof SyntaxError) return true
  const m = err instanceof Error ? err.message : ''
  return /JSON|Unexpected token|Unterminated|Unexpected end of (JSON|input)/i.test(m)
}

export async function runAgentTurn(input: {
  history: HistoryTurn[]
  userMessage: string
  todayYMD: string
  ctx: AgentToolContext
  emit: (event: AgentStreamEvent) => void
  clientFactory?: AnthropicFactory
  /** Injectable for unit tests; production always uses executeAgentTool. */
  executeTool?: (name: string, toolInput: unknown, ctx: AgentToolContext) => Promise<ToolExecution>
}): Promise<AgentTurnResult> {
  const { ctx, emit } = input
  if (!agentConfigured()) {
    const message =
      'Ask Fox is not configured yet: ANTHROPIC_API_KEY is not set on the server. Nothing was read or written.'
    emit({ type: 'error', message })
    return { text: '', toolLog: [], error: message }
  }

  const client = (input.clientFactory ?? defaultFactory)()
  const toolLog: AgentToolCallLogEntry[] = []
  let visibleText = ''
  let toolCallsThisTurn = 0

  const messages: Anthropic.MessageParam[] = [
    ...input.history.map(h => ({ role: h.role, content: h.content }) as Anthropic.MessageParam),
    { role: 'user', content: input.userMessage },
  ]

  // The static prompt caches (prefix match: tools render first, then
  // system; the marker on the static block covers both). The runtime
  // context renders after the breakpoint so the date never busts the
  // cache.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: AGENT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildRuntimeContext({ todayYMD: input.todayYMD, viewerEmail: ctx.viewerEmail }) },
  ]

  // Hard iteration ceiling above the tool budget: the model gets a few
  // closing iterations after the budget exhausts, never an unbounded loop.
  const maxIterations = MAX_TOOL_CALLS_PER_TURN + 3

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const stream = client.messages.stream({
        model: agentModel(),
        max_tokens: AGENT_MAX_OUTPUT_TOKENS,
        thinking: { type: 'adaptive' },
        system,
        tools: AGENT_TOOLS,
        messages,
      })
      stream.on('text', delta => {
        visibleText += delta
        emit({ type: 'text', delta })
      })
      const message = await stream.finalMessage()

      if (message.stop_reason === 'refusal') {
        const msg = 'The model declined this request. Nothing was read or written for it.'
        emit({ type: 'error', message: msg })
        return { text: visibleText, toolLog, error: msg }
      }

      if (message.stop_reason === 'max_tokens') {
        // The answer was cut off: valid model text that hit the 16k ceiling.
        // This is VALID (readable) content, unlike a parse-failed reply, so it
        // is kept with an honest cut-off note (the brief's "fail with honest
        // copy about the answer being cut off"). Unreadable replies are the
        // ones never kept — see the catch block.
        const msg = 'The reply hit its length ceiling and may be cut short. Ask a follow-up for the rest.'
        emit({ type: 'error', message: msg })
        return { text: visibleText, toolLog, error: null }
      }

      const toolUses = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )
      if (message.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return { text: visibleText, toolLog, error: null }
      }

      // Full content back (thinking blocks included), then every tool
      // result in ONE user message.
      messages.push({ role: 'assistant', content: message.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const use of toolUses) {
        if (!toolBudgetHasRoom(toolCallsThisTurn)) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: toolBudgetExhaustedNote(),
            is_error: true,
          })
          continue
        }
        toolCallsThisTurn += 1
        emit({ type: 'tool', name: use.name, status: 'running' })
        // A tool that throws must never crash the whole turn (the
        // 2026-07-20 knowledge_lookup incident): a throw becomes a failed
        // tool result the model can respond to, and the turn continues.
        let execution: ToolExecution
        try {
          execution = await (input.executeTool ?? executeAgentTool)(use.name, use.input, ctx)
        } catch {
          execution = { ok: false, result: { error: 'the tool failed to run' }, summary: 'tool error' }
        }
        toolLog.push({
          name: use.name,
          input: (use.input ?? {}) as Record<string, unknown>,
          ok: execution.ok,
          summary: execution.summary,
        })
        emit({
          type: 'tool',
          name: use.name,
          status: execution.ok ? 'ok' : 'failed',
          summary: execution.summary,
        })
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(execution.result),
          is_error: !execution.ok,
        })
      }
      messages.push({ role: 'user', content: results })
    }

    const msg =
      'This message ran out of room for further checks. What is written above stands. Send a follow-up for the rest.'
    emit({ type: 'error', message: msg })
    return { text: visibleText, toolLog, error: null }
  } catch (err) {
    // Three honest cases, plain words, no semicolons. A caught turn is
    // untrustworthy, so nothing partial is kept as the reply (text is
    // discarded); the store records the honest error instead.
    let msg = 'Ask Fox could not reach the model. Nothing was written, retry in a moment.'
    if (err instanceof Anthropic.AuthenticationError) {
      msg = 'The ANTHROPIC_API_KEY on the server was refused. Nothing was written, check the key in Vercel.'
    } else if (err instanceof Anthropic.RateLimitError) {
      msg = 'The model is rate limited right now. Nothing was written, wait a moment and retry.'
    } else if (err instanceof Anthropic.APIError) {
      msg = `The model API returned an error (HTTP ${err.status ?? 'unknown'}). Nothing was written, retry in a moment.`
    } else if (isUnreadableReplyError(err)) {
      msg = 'Ask Fox got a reply it could not read. Nothing was written, retry in a moment.'
    }
    console.error('[agent] turn failed:', err instanceof Error ? err.message.slice(0, 200) : 'error')
    emit({ type: 'error', message: msg })
    return { text: '', toolLog, error: msg }
  }
}
