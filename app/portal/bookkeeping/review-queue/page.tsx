'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, Edit3, Clock, ChevronDown, ChevronUp } from 'lucide-react'

interface ReviewRecord {
  ID: string
  Transaction_ID: string
  Transaction_Date: string
  Vendor_Name: string
  Amount: string
  Suggested_Account: string
  Suggested_Memo_Tag: string
  Confidence_Score: string
  Match_Method: string
  AI_Notes: string
  Status: string
  Final_Account: string
  Final_Memo_Tag: string
  Reviewer_Notes: string
}

const MEMO_TAGS = ['[FOXM]', '[PHUB]', '[FSOC]', '[TLB]', '[OVHD]']

const ACCOUNTS = [
  'Fox Mortgage - Commission Income',
  'Fox Social - Subscription Revenue',
  'Left Bench - Coaching Revenue',
  'Left Bench - Platform Revenue',
  'Printhub - Product Revenue',
  'Deferred Revenue',
  'Software Subscriptions',
  'Gas',
  'Telephone',
  'Bank Charges',
  'Insurance',
  'Office Supplies',
  'Travel',
  'Other',
]

export default function ReviewQueuePage() {
  const [records, setRecords] = useState<ReviewRecord[]>([])
  const [filter, setFilter] = useState<'Pending' | 'Approved' | 'Corrected' | 'Rejected' | ''>('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, { account: string; tag: string; notes: string }>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter
        ? `/api/bookkeeping/review-queue?status=${filter}`
        : '/api/bookkeeping/review-queue'
      const res = await fetch(url)
      const data = await res.json()
      setRecords(data.records || [])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function submitDecision(record: ReviewRecord, status: 'Approved' | 'Corrected' | 'Rejected') {
    const edits = editing[record.ID] || {}
    setSubmitting(record.ID)
    try {
      const res = await fetch('/api/bookkeeping/review-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowId: record.ID,
          Status: status,
          Final_Account: edits.account || record.Suggested_Account,
          Final_Memo_Tag: edits.tag || record.Suggested_Memo_Tag,
          Reviewer_Notes: edits.notes || '',
        }),
      })
      if (res.ok) {
        showToast(`Transaction ${status.toLowerCase()}.`, true)
        await load()
        setExpanded(null)
      } else {
        showToast('Failed to update. Try again.', false)
      }
    } finally {
      setSubmitting(null)
    }
  }

  function confidence(score: string) {
    const n = Math.round(Number(score) * 100)
    const color = n >= 80 ? 'text-green-600' : n >= 60 ? 'text-yellow-600' : 'text-red-500'
    return <span className={`font-semibold ${color}`}>{n}%</span>
  }

  const pendingCount = records.filter(r => r.Status === 'Pending').length

  return (
    <div className="max-w-4xl">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-body font-semibold flex items-center gap-2 ${
            toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-navy text-2xl font-bold">Review Queue</h1>
          <p className="text-gray-500 text-sm font-body mt-1">
            Transactions flagged for human review by the categorization agent
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-yellow-100 text-yellow-700 font-semibold text-sm px-3 py-1 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['', 'Pending', 'Approved', 'Corrected', 'Rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-body font-medium transition-colors ${
              filter === f
                ? 'bg-navy text-white'
                : 'bg-white border border-gray-200 text-gray-500 hover:text-navy'
            }`}
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No transactions in this view.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((rec) => {
            const isOpen = expanded === rec.ID
            const edits = editing[rec.ID] || { account: rec.Suggested_Account, tag: rec.Suggested_Memo_Tag, notes: '' }

            return (
              <div key={rec.ID} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : rec.ID)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      {rec.Status === 'Pending' ? (
                        <Clock className="w-4 h-4 text-yellow-500" />
                      ) : rec.Status === 'Approved' ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : rec.Status === 'Corrected' ? (
                        <Edit3 className="w-4 h-4 text-blue-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-navy font-semibold text-sm truncate">
                        {rec.Vendor_Name || '—'}
                      </p>
                      <p className="text-gray-400 text-xs">
                        {rec.Transaction_Date} &middot; ${Number(rec.Amount || 0).toFixed(2)} &middot; {rec.Match_Method || 'unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span className="text-xs text-gray-400 font-mono hidden md:block">{rec.Suggested_Memo_Tag}</span>
                    <span className="hidden md:block">{confidence(rec.Confidence_Score)}</span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        rec.Status === 'Approved'
                          ? 'bg-green-100 text-green-700'
                          : rec.Status === 'Pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : rec.Status === 'Corrected'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {rec.Status}
                    </span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-5 bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Transaction ID</p>
                        <p className="text-sm font-mono text-navy">{rec.Transaction_ID || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confidence</p>
                        <p className="text-sm">{confidence(rec.Confidence_Score)} ({rec.Match_Method})</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Suggested Account</p>
                        <p className="text-sm text-navy">{rec.Suggested_Account || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Suggested Memo Tag</p>
                        <p className="text-sm font-mono text-navy">{rec.Suggested_Memo_Tag || '—'}</p>
                      </div>
                    </div>

                    {rec.AI_Notes && (
                      <div className="mb-4 bg-white border border-gray-200 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">AI Notes</p>
                        <p className="text-sm text-gray-700">{rec.AI_Notes}</p>
                      </div>
                    )}

                    {rec.Status === 'Pending' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                              Final Account
                            </label>
                            <select
                              value={edits.account}
                              onChange={e => setEditing(prev => ({ ...prev, [rec.ID]: { ...edits, account: e.target.value } }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
                            >
                              <option value="">— use suggested —</option>
                              {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                              Final Memo Tag
                            </label>
                            <select
                              value={edits.tag}
                              onChange={e => setEditing(prev => ({ ...prev, [rec.ID]: { ...edits, tag: e.target.value } }))}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-lime"
                            >
                              <option value="">— use suggested —</option>
                              {MEMO_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                            Reviewer Notes
                          </label>
                          <input
                            type="text"
                            value={edits.notes}
                            onChange={e => setEditing(prev => ({ ...prev, [rec.ID]: { ...edits, notes: e.target.value } }))}
                            placeholder="Optional notes..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-lime"
                          />
                        </div>

                        <div className="flex gap-3 pt-1">
                          <button
                            onClick={() => submitDecision(rec, 'Approved')}
                            disabled={!!submitting}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => submitDecision(rec, 'Corrected')}
                            disabled={!!submitting}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                            Correct &amp; Apply
                          </button>
                          <button
                            onClick={() => submitDecision(rec, 'Rejected')}
                            disabled={!!submitting}
                            className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {rec.Status !== 'Pending' && (rec.Final_Account || rec.Reviewer_Notes) && (
                      <div className="mt-2 pt-3 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                        {rec.Final_Account && <p><span className="font-semibold">Final account:</span> {rec.Final_Account}</p>}
                        {rec.Final_Memo_Tag && <p><span className="font-semibold">Final tag:</span> {rec.Final_Memo_Tag}</p>}
                        {rec.Reviewer_Notes && <p><span className="font-semibold">Notes:</span> {rec.Reviewer_Notes}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
