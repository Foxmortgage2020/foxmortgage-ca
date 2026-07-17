// Ask Fox history (Agent session): every conversation, because a
// reviewable trail is the point. Rows link back into the chat.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import DemoNotAvailable from '@/components/admin/DemoNotAvailable'
import { listConversations } from '@/lib/agent/store'
import { fmtDateTime } from '@/lib/dates'
import StatusChip from '@/components/admin/ds/StatusChip'

export const dynamic = 'force-dynamic'

export default async function AgentHistoryPage() {
  await requirePermission('agent.use')
  if (isDemoMode()) return <DemoNotAvailable surface="Ask Fox history" />

  const res = await listConversations()
  const conversations = res.configured && res.ok ? res.data : []

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-navy text-2xl font-bold">Ask Fox history</h1>
          <p className="text-cool-500 font-ui text-sm mt-1">
            Every conversation with its tool calls and card outcomes, kept as the supervision
            record. Nothing here deletes.
          </p>
        </div>
        <Link
          href="/portal/admin/agent"
          className="shrink-0 text-xs font-bold bg-navy text-white rounded-lg px-3 py-2"
        >
          New thread
        </Link>
      </div>

      <div className="mt-6 space-y-2">
        {!res.configured ? (
          <p className="text-sm text-cool-500 font-ui bg-white border border-cool-200 rounded-[9px] p-5">
            The conversation store is not configured.
          </p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-cool-500 font-ui bg-white border border-cool-200 rounded-[9px] p-5">
            No conversations yet.
          </p>
        ) : (
          conversations.map(c => (
            <Link
              key={c.id}
              href={`/portal/admin/agent?c=${c.id}`}
              className="block bg-white border border-cool-200 rounded-[9px] px-4 py-3 hover:border-navy/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-ui font-semibold text-navy min-w-0 truncate">
                  {c.title}
                </span>
                {c.status === 'capped' && <StatusChip tone="gray">capped</StatusChip>}
                <span className="ml-auto text-[11px] text-cool-500 font-ui shrink-0 tabular-nums">
                  {c.message_count} message{c.message_count === 1 ? '' : 's'} · {fmtDateTime(c.updated_at)}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
