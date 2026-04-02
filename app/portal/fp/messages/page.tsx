'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

const mockThread = [
  {
    from: 'Michael Fox',
    body: 'Hi! Welcome to the Fox Mortgage Financial Planner Portal. Feel free to use this space to ask questions or discuss anything not specific to a single client file.',
    date: 'Apr 1, 2026',
  },
]

export default function FPMessagesPage() {
  const [messages, setMessages] = useState(mockThread)
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = messageText.trim()
    if (!text) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/portal/fp/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, context: 'general' }),
      })

      if (!res.ok) {
        throw new Error('Failed to send message')
      }

      setMessages((prev) => [
        ...prev,
        { from: 'You', body: text, date: 'Just now' },
      ])
      setMessageText('')
    } catch {
      setError('Message could not be sent. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
            key={i}
            className={`flex ${msg.from === 'You' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-md px-4 py-3 rounded-xl text-sm font-body ${
                msg.from === 'You' ? 'bg-navy text-white' : 'bg-gray-100 text-navy'
              }`}
            >
              <p className="text-[10px] font-semibold mb-1 opacity-70">{msg.from}</p>
              <p className="leading-relaxed">{msg.body}</p>
              <p className="text-[10px] mt-1.5 opacity-50">{msg.date}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 font-body text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Compose */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Type a message to Michael..."
          disabled={loading}
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!messageText.trim() || loading}
          className="bg-lime text-navy font-heading font-bold text-xs px-4 py-2.5 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <div className="w-3 h-3 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Send
        </button>
      </form>

      <p className="font-body text-xs text-gray-400 mt-3">
        Michael typically responds within 1 business day. You&apos;ll receive an email notification
        when he replies.
      </p>
    </div>
  )
}
