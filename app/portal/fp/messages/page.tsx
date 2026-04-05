'use client'

import { useState, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'

interface Message {
  id?: string
  from: string
  body: string
  date: string
}

function formatDate(iso: string): string {
  if (!iso || iso === 'Just now') return iso
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return iso
  }
}

const WELCOME: Message = {
  from: 'Michael Fox',
  body: 'Hi! Welcome to the Fox Mortgage Financial Planner Portal. Feel free to use this space to ask questions or discuss anything not specific to a single client file.',
  date: '',
}

export default function FPMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // Load existing message thread from Zoho on mount
  useEffect(() => {
    fetch('/api/portal/fp/messages')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        const notes: Message[] = (data.messages ?? []).map((n: any) => ({
          id: n.id,
          from: n.createdBy === 'Michael Fox' ? 'Michael Fox' : 'You',
          body: n.body,
          date: n.createdTime,
        }))
        // Always show welcome message first if thread is empty or use real thread
        setMessages(notes.length > 0 ? notes : [WELCOME])
      })
      .catch(() => {
        // If Zoho not yet wired, fall back to welcome message
        setMessages([WELCOME])
      })
      .finally(() => setLoadingThread(false))
  }, [])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = messageText.trim()
    if (!text) return

    setSending(true)
    setError('')

    try {
      const res = await fetch('/api/portal/fp/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, context: 'general' }),
      })

      if (!res.ok) throw new Error('Failed to send message')

      setMessages((prev) => [
        ...prev,
        { from: 'You', body: text, date: 'Just now' },
      ])
      setMessageText('')
    } catch {
      setError('Message could not be sent. Please try again.')
    } finally {
      setSending(false)
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
        {loadingThread ? (
          <div className="flex items-center justify-center flex-1 gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-body text-sm">Loading messages…</span>
          </div>
        ) : (
          messages.map((msg, i) => (
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
          ))
        )}
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
          placeholder="Type a message to Michael…"
          disabled={sending}
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!messageText.trim() || sending}
          className="bg-lime text-navy font-heading font-bold text-xs px-4 py-2.5 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {sending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
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
