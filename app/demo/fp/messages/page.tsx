// ─── Demo FP messages (read-only) ──────────────────────────────────────────────
// Mirrors app/portal/fp/messages/page.tsx. Renders a couple of inline sample
// threads. The compose box is present but VISIBLY DISABLED — there is no working
// send and no POST to /api/portal/fp/message. ZERO fetch, no Clerk.
//
// Server component: the only state in the original was fetch/send plumbing, all
// removed here, so no client directive is needed.

import { Send } from 'lucide-react'
import { DEMO_MESSAGES } from '../_data/demo-data'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(value: string): string {
  if (!value) return value
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return `${MONTHS_SHORT[Number(m) - 1]} ${Number(d)}, ${y}`
  }
  try {
    return new Date(value).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return value
  }
}

export default function DemoFPMessagesPage() {
  const messages = DEMO_MESSAGES

  return (
    <div className="max-w-2xl">
      <p className="font-body text-sm text-gray-600 mb-6">
        Your general message thread with Michael Fox. For client-specific messages, use the message
        box on each client&apos;s detail page.
      </p>

      {/* Chat area */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-4 min-h-[320px] flex flex-col gap-4">
        {messages.map((msg, i) => (
          <div
            key={msg.id ?? i}
            className={`flex ${msg.from === 'You' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-md px-4 py-3 rounded-xl text-sm font-body ${
                msg.from === 'You' ? 'bg-navy text-white' : 'bg-gray-100 text-navy'
              }`}
            >
              <p className="text-[10px] font-semibold mb-1 opacity-70">{msg.from}</p>
              <p className="leading-relaxed">{msg.body}</p>
              {msg.date && (
                <p className="text-[10px] mt-1.5 opacity-50">{formatDate(msg.date)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Compose — visibly disabled in the demo (no working send) */}
      <div className="flex gap-2">
        <input
          type="text"
          value=""
          readOnly
          disabled
          placeholder="Messaging is available in the live portal"
          aria-disabled="true"
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 font-body text-sm text-navy placeholder-gray-400 bg-gray-50 opacity-60 cursor-not-allowed"
        />
        <span
          aria-disabled="true"
          title="Disabled in demo"
          className="bg-lime text-navy font-heading font-bold text-xs px-4 py-2.5 rounded-lg opacity-40 cursor-not-allowed flex items-center gap-2 select-none"
        >
          <Send className="w-3 h-3" />
          Send
        </span>
      </div>

      <p className="font-body text-xs text-gray-400 mt-3">
        This is a sample thread. In the live portal, Michael typically responds within 1 business
        day and you receive an email notification when he replies.
      </p>
    </div>
  )
}
