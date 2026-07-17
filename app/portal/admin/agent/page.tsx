// Ask Fox (Agent session): the in-portal practice agent. The chat reads
// the systems this portal already trusts (Zoho, the gate-approved rate
// book, the knowledge base, the workbench read-only role), grounds every
// figure in its source, and proposes writes only as confirm cards. The
// desk decides; this page briefs the decider. Every conversation persists
// as a supervision artifact.

import { Suspense } from 'react'
import { can, requirePermission } from '@/lib/authz'
import AgentChat, { type AgentChatInitial } from '@/components/admin/AgentChat'
import { agentConfigured } from '@/lib/agent/loop'
import {
  agentStoreConfigured,
  getConversation,
  listCards,
  listMessages,
} from '@/lib/agent/store'
import { conversationHasRoom } from '@/lib/agent/limits'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AgentPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const user = await requirePermission('agent.use')
  const canExecute = can(user, 'agent.execute')

  const rawC = typeof searchParams?.c === 'string' ? searchParams.c : null
  const conversationId = rawC && UUID_RE.test(rawC) ? rawC : null

  const initial: AgentChatInitial = {
    conversationId: null,
    messages: [],
    cards: [],
    capped: false,
    storeConfigured: agentStoreConfigured(),
    agentConfigured: agentConfigured(),
  }
  if (conversationId) {
    const conv = await getConversation(conversationId)
    if (conv.configured && conv.ok && conv.data) {
      const [messages, cards] = await Promise.all([
        listMessages(conversationId),
        listCards(conversationId),
      ])
      initial.conversationId = conversationId
      initial.messages = messages.configured && messages.ok ? messages.data : []
      initial.cards = cards.configured && cards.ok ? cards.data : []
      initial.capped =
        conv.data.status === 'capped' || !conversationHasRoom(conv.data.message_count)
    }
  }

  return (
    <div className="max-w-3xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Ask Fox</h1>
        <p className="text-cool-500 font-ui text-sm mt-1">
          Call prep and call review over the practice&apos;s own records: every number sourced,
          every gap named, every CRM change a card you confirm. Decisions stay on the Approvals
          desk.
        </p>
      </div>
      <div className="mt-4">
        <Suspense fallback={<p className="text-sm text-cool-500 font-ui">Loading…</p>}>
          <AgentChat initial={initial} canExecute={canExecute} />
        </Suspense>
      </div>
    </div>
  )
}
