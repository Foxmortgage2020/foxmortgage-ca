// Ask Fox conversation store client (Agent session). Server-only: talks
// to the foxmortgage-ca Supabase project through the narrow
// security-definer functions from migration 20260710190000 (table access
// refuses with 42501, verified live). Every conversation, message, tool
// call, and confirm-card outcome persists here: a reviewable trail is the
// point. Nothing deletes.

import { foxcaOperatorSecret } from '@/lib/foxca-secret'

export type StoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function agentStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<StoreResult<T>> {
  const env = foxcaEnv()
  if (!env) return { configured: false }
  const started = Date.now()
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      // Function name and status only; bodies may quote message content.
      console.error(`[agent-store] ${fn} HTTP ${res.status} ms=${ms}`)
      return { configured: true, ok: false, error: `Store call failed (HTTP ${res.status})` }
    }
    const data = (await res.json().catch(() => null)) as T
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[agent-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Conversation store unreachable' }
  }
}

// Rows exactly as the functions return them.

export interface AgentConversationRow {
  id: string
  title: string
  status: 'open' | 'capped'
  message_count: number
  created_by: string
  created_by_clerk_id: string | null
  created_at: string
  updated_at: string
}

export interface AgentMessageRow {
  id: string
  conversation_id: string
  seq: number
  role: 'user' | 'assistant'
  content: string
  tool_calls: AgentToolCallLogEntry[]
  created_by: string
  created_at: string
}

export interface AgentToolCallLogEntry {
  name: string
  input: Record<string, unknown>
  ok: boolean
  summary: string
}

export interface AgentCardRow {
  id: string
  conversation_id: string
  turn_seq: number
  kind: 'zoho_update' | 'task_create'
  payload: Record<string, unknown>
  reason: string | null
  status: 'proposed' | 'executed' | 'dismissed'
  result: Record<string, unknown> | null
  created_by: string
  created_at: string
  decided_by: string | null
  decided_at: string | null
}

export function createConversation(
  title: string,
  actor: string,
  clerkId: string | null,
): Promise<StoreResult<string>> {
  return rpc('agent_conversation_create', { p_title: title, p_actor: actor, p_clerk_id: clerkId, p_operator_secret: foxcaOperatorSecret() })
}

export function listConversations(): Promise<StoreResult<AgentConversationRow[]>> {
  return rpc('agent_conversations_list', { p_operator_secret: foxcaOperatorSecret() })
}

export async function getConversation(id: string): Promise<StoreResult<AgentConversationRow | null>> {
  const res = await rpc<AgentConversationRow[]>('agent_conversation_get', { p_id: id, p_operator_secret: foxcaOperatorSecret() })
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data[0] ?? null }
}

export function listMessages(conversationId: string): Promise<StoreResult<AgentMessageRow[]>> {
  return rpc('agent_messages_list', { p_conversation_id: conversationId, p_operator_secret: foxcaOperatorSecret() })
}

export function appendMessage(input: {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: AgentToolCallLogEntry[]
  actor: string
}): Promise<StoreResult<number>> {
  return rpc('agent_message_append', {
    p_conversation_id: input.conversationId,
    p_role: input.role,
    p_content: input.content,
    p_tool_calls: input.toolCalls,
    p_actor: input.actor,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export function setConversationStatus(
  id: string,
  status: 'open' | 'capped',
  actor: string,
): Promise<StoreResult<boolean>> {
  return rpc('agent_conversation_set_status', { p_id: id, p_status: status, p_actor: actor, p_operator_secret: foxcaOperatorSecret() })
}

export function createCard(input: {
  conversationId: string
  turnSeq: number
  kind: 'zoho_update' | 'task_create'
  payload: Record<string, unknown>
  reason: string | null
  actor: string
}): Promise<StoreResult<string>> {
  return rpc('agent_card_create', {
    p_conversation_id: input.conversationId,
    p_turn_seq: input.turnSeq,
    p_kind: input.kind,
    p_payload: input.payload,
    p_reason: input.reason,
    p_actor: input.actor,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export function listCards(conversationId: string): Promise<StoreResult<AgentCardRow[]>> {
  return rpc('agent_cards_list', { p_conversation_id: conversationId, p_operator_secret: foxcaOperatorSecret() })
}

export async function getCard(id: string): Promise<StoreResult<AgentCardRow | null>> {
  const res = await rpc<AgentCardRow[]>('agent_card_get', { p_id: id, p_operator_secret: foxcaOperatorSecret() })
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data[0] ?? null }
}

/** Returns true when this call decided the card; false when it was
 * already decided (the route renders that as a conflict). */
export function decideCard(
  id: string,
  status: 'executed' | 'dismissed',
  result: Record<string, unknown> | null,
  actor: string,
): Promise<StoreResult<boolean>> {
  return rpc('agent_card_decide', { p_id: id, p_status: status, p_result: result, p_actor: actor, p_operator_secret: foxcaOperatorSecret() })
}
