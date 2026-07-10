// Ask Fox history (Agent session): every conversation, because a
// reviewable trail is the point. Rows link back into the chat.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { listConversations } from '@/lib/agent/store'
import { fmtDateTime } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function AgentHistoryPage() {
  await requirePermission('agent.use')
  const res = await listConversations()
  const conversations = res.configured && res.ok ? res.data : []

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-navy text-2xl font-bold">Ask Fox history</h1>
          <p className="text-gray-500 font-body text-sm mt-1">
            Every conversation with its tool calls and card outcomes, kept as the supervision
            record. Nothing here deletes.
          </p>
        </div>
        <Link
          href="/portal/admin/agent"
          className="shrink-0 text-xs font-bold bg-lime text-navy rounded-lg px-3 py-2"
        >
          New thread
        </Link>
      </div>

      <div className="mt-6 space-y-2">
        {!res.configured ? (
          <p className="text-sm text-gray-400 font-body bg-white border border-gray-200 rounded-xl p-5">
            The conversation store is not configured.
          </p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-gray-400 font-body bg-white border border-gray-200 rounded-xl p-5">
            No conversations yet.
          </p>
        ) : (
          conversations.map(c => (
            <Link
              key={c.id}
              href={`/portal/admin/agent?c=${c.id}`}
              className="block bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-navy/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-body font-semibold text-navy min-w-0 truncate">
                  {c.title}
                </span>
                {c.status === 'capped' && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    capped
                  </span>
                )}
                <span className="ml-auto text-[11px] text-gray-400 font-body shrink-0">
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
