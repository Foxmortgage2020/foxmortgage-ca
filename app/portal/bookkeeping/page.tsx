'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ClipboardList, FolderOpen, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react'

interface ReviewRecord {
  ID: string
  Status: string
  Vendor_Name: string
  Amount: string
  Confidence_Score: string
}

export default function BookkeepingDashboard() {
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [recentRecords, setRecentRecords] = useState<ReviewRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [pendingRes, allRes] = await Promise.all([
          fetch('/api/bookkeeping/review-queue?status=Pending'),
          fetch('/api/bookkeeping/review-queue'),
        ])
        if (pendingRes.ok) {
          const data = await pendingRes.json()
          setPendingCount(data.records?.length ?? 0)
        }
        if (allRes.ok) {
          const data = await allRes.json()
          setRecentRecords((data.records || []).slice(0, 5))
        }
      } catch {
        // non-blocking
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const quickActions = [
    {
      href: '/portal/bookkeeping/review-queue',
      icon: ClipboardList,
      label: 'Review Queue',
      desc: 'Approve, correct, or reject flagged transactions',
      accent: pendingCount !== null && pendingCount > 0,
      badge: pendingCount !== null && pendingCount > 0 ? `${pendingCount} pending` : null,
    },
    {
      href: '/portal/bookkeeping/projects',
      icon: FolderOpen,
      label: 'Production Contracts',
      desc: 'Manage Printhub contracts and milestone revenue recognition',
      accent: false,
      badge: null,
    },
  ]

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-heading text-navy text-2xl font-bold">Bookkeeping Agent</h1>
        <p className="text-gray-500 font-body mt-1 text-sm">
          Automated QBO categorization — 2802551 Ontario Inc.
        </p>
      </div>

      {/* Status banner */}
      <div className="bg-navy text-white rounded-xl p-5 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-lime animate-pulse" />
          <div>
            <p className="font-heading font-bold text-sm">Nightly workflow active</p>
            <p className="text-gray-400 text-xs mt-0.5">Runs at 2:00 AM ET · QBO Plus classes · Dry-run until credentials attached in n8n</p>
          </div>
        </div>
        <Link
          href="https://foxmortgage.app.n8n.cloud/workflow/Rupc79GeJ8s6bbJa"
          target="_blank"
          rel="noopener noreferrer"
          className="text-lime text-xs font-semibold hover:underline"
        >
          View in n8n &rarr;
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className={`bg-white rounded-xl border-2 p-6 hover:border-lime transition-all ${
                action.accent ? 'border-yellow-300' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="bg-lime/10 rounded-lg p-2">
                  <Icon className="w-5 h-5 text-lime" />
                </div>
                {action.badge && (
                  <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {action.badge}
                  </span>
                )}
              </div>
              <p className="font-heading text-navy font-bold mt-3">{action.label}</p>
              <p className="text-gray-500 text-sm font-body mt-1">{action.desc}</p>
              <p className="text-lime text-sm font-semibold mt-3">Open &rarr;</p>
            </Link>
          )
        })}
      </div>

      {/* QBO Classes reference */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-navy font-bold">QBO Business Line Classes</h2>
          <span className="text-xs bg-lime/20 text-navy font-semibold px-2 py-0.5 rounded-full">Plus Tier Active</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { name: 'Fox Mortgage', desc: 'Commissions, licences, legal' },
            { name: 'Printhub', desc: 'Shipping, courier, production' },
            { name: 'Fox Social', desc: 'SaaS revenue, email services' },
            { name: 'Left Bench', desc: 'Coaching, video conferencing' },
            { name: 'Overhead', desc: 'Utilities, software, insurance' },
          ].map((cls) => (
            <div key={cls.name} className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="font-semibold text-navy text-xs">{cls.name}</p>
              <p className="text-gray-400 text-xs mt-1">{cls.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Classes are assigned natively in QBO on each transaction line item via ClassRef. Run QBO class reports for business line P&amp;L breakdowns.</p>
      </div>

      {/* Recent review queue activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-navy font-bold">Recent Review Queue</h2>
          <Link href="/portal/bookkeeping/review-queue" className="text-lime text-sm font-semibold">
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : recentRecords.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-gray-400">
            <CheckCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">No transactions in the queue yet.</p>
            <p className="text-xs mt-1">The nightly workflow will populate this once running.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentRecords.map((rec) => {
              const statusIcon =
                rec.Status === 'Approved' ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : rec.Status === 'Pending' ? (
                  <Clock className="w-4 h-4 text-yellow-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )
              return (
                <div key={rec.ID} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {statusIcon}
                    <div>
                      <p className="text-sm font-body text-navy font-semibold">
                        {rec.Vendor_Name || '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        ${Number(rec.Amount || 0).toFixed(2)} &middot; confidence{' '}
                        {Math.round(Number(rec.Confidence_Score || 0) * 100)}%
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      rec.Status === 'Approved'
                        ? 'bg-green-100 text-green-700'
                        : rec.Status === 'Pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {rec.Status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* QBO realm reference */}
      <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-start gap-3">
        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-gray-500 font-body space-y-0.5">
          <p><span className="font-semibold text-gray-700">Production QBO Realm:</span> 9341456900727321 — DO NOT write until Intuit App Assessment approved</p>
          <p><span className="font-semibold text-gray-700">Sandbox QBO Realm:</span> 9341456901231490 — all dev/test runs here</p>
          <p><span className="font-semibold text-gray-700">n8n Workflow:</span> Rupc79GeJ8s6bbJa · Weekly summary: Mondays 9 AM ET</p>
        </div>
      </div>
    </div>
  )
}
