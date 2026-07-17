'use client'

// The Bookkeeping landing — reparented unchanged as the Revenue page's
// Bookkeeping tab (B3), restyled onto the design contract (cool grays,
// system radii, no decorative lime — lime is a queued decision, and
// nothing here queues one). The working pages keep their own routes:
// /portal/bookkeeping/review-queue and /portal/bookkeeping/projects.

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

export default function BookkeepingTab() {
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
    <div>
      <p className="mb-6 font-ui text-sm text-cool-600">
        Automated QBO categorization — 2802551 Ontario Inc.
      </p>

      {/* Status banner */}
      <div className="bg-navy text-white rounded-[9px] p-5 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-green-400 motion-safe:animate-pulse" />
          <div>
            <p className="font-heading font-bold text-sm">Nightly workflow active</p>
            <p className="text-cool-500 text-xs mt-0.5">Runs at 2:00 AM ET · QBO Plus classes · Dry-run until credentials attached in n8n</p>
          </div>
        </div>
        <Link
          href="https://foxmortgage.app.n8n.cloud/workflow/Rupc79GeJ8s6bbJa"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/85 text-xs font-semibold underline hover:text-white"
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
              className={`bg-white rounded-[9px] border-2 p-6 hover:border-navy/40 motion-safe:transition-all ${
                action.accent ? 'border-caution/50' : 'border-cool-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="bg-cool-100 rounded-lg p-2">
                  <Icon className="w-5 h-5 text-navy" />
                </div>
                {action.badge && (
                  <span className="bg-caution-bg text-caution text-xs font-semibold px-2 py-0.5 rounded-full">
                    {action.badge}
                  </span>
                )}
              </div>
              <p className="font-heading text-navy font-bold mt-3">{action.label}</p>
              <p className="text-cool-600 text-sm font-body mt-1">{action.desc}</p>
              <p className="text-navy text-sm font-semibold mt-3 underline decoration-cool-300">Open &rarr;</p>
            </Link>
          )
        })}
      </div>

      {/* QBO Classes reference */}
      <div className="bg-white rounded-[9px] border border-cool-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-navy font-bold">QBO Business Line Classes</h2>
          <span className="text-xs bg-cool-100 text-cool-700 font-semibold px-2 py-0.5 rounded-full">Plus Tier Active</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { name: 'Fox Mortgage', desc: 'Commissions, licences, legal' },
            { name: 'Printhub', desc: 'Shipping, courier, production' },
            { name: 'Fox Social', desc: 'SaaS revenue, email services' },
            { name: 'Left Bench', desc: 'Coaching, video conferencing' },
            { name: 'Overhead', desc: 'Utilities, software, insurance' },
          ].map((cls) => (
            <div key={cls.name} className="bg-cool-50 rounded-lg p-3 text-center">
              <p className="font-semibold text-navy text-xs">{cls.name}</p>
              <p className="text-cool-500 text-xs mt-1">{cls.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-cool-500 mt-3">Classes are assigned natively in QBO on each transaction line item via ClassRef. Run QBO class reports for business line P&amp;L breakdowns.</p>
      </div>

      {/* Recent review queue activity */}
      <div className="bg-white rounded-[9px] border border-cool-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-navy font-bold">Recent Review Queue</h2>
          <Link href="/portal/bookkeeping/review-queue" className="text-navy text-sm font-semibold underline decoration-cool-300 hover:decoration-navy">
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-cool-100 rounded motion-safe:animate-pulse" />
            ))}
          </div>
        ) : recentRecords.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-cool-500">
            <CheckCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">No transactions in the queue yet.</p>
            <p className="text-xs mt-1">The nightly workflow will populate this once running.</p>
          </div>
        ) : (
          <div className="divide-y divide-cool-100">
            {recentRecords.map((rec) => {
              const statusIcon =
                rec.Status === 'Approved' ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : rec.Status === 'Pending' ? (
                  <Clock className="w-4 h-4 text-caution" />
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
                      <p className="text-xs text-cool-500">
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
                        ? 'bg-caution-bg text-caution'
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
      <div className="mt-6 bg-cool-50 rounded-lg border border-cool-200 p-4 flex items-start gap-3">
        <FileText className="w-4 h-4 text-cool-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-cool-600 font-body space-y-0.5">
          <p><span className="font-semibold text-cool-800">Production QBO Realm:</span> 9341456900727321 — DO NOT write until Intuit App Assessment approved</p>
          <p><span className="font-semibold text-cool-800">Sandbox QBO Realm:</span> 9341456901231490 — all dev/test runs here</p>
          <p><span className="font-semibold text-cool-800">n8n Workflow:</span> Rupc79GeJ8s6bbJa · Weekly summary: Mondays 9 AM ET</p>
        </div>
      </div>
    </div>
  )
}
