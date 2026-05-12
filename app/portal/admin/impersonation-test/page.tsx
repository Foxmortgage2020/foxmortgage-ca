// THROWAWAY test harness — delete in step 2 of the impersonation build.
// Visit at /portal/admin/_impersonation-test as an admin to verify that
// the cookie set / destroy / read cycle works end-to-end.

'use client'

import { useEffect, useState } from 'react'

const BEN_ZAVITZ_FP_ID = '7112178000003669036'
const DOMENIC_INVESTOR_ID = '7112178000001393118'

type AnyResponse = unknown

export default function ImpersonationTestPage() {
  const [actionResult, setActionResult] = useState<AnyResponse>(null)
  const [contextResult, setContextResult] = useState<AnyResponse>(null)
  const [loading, setLoading] = useState(false)

  async function refreshContext() {
    const res = await fetch('/api/admin/test-context', { cache: 'no-store' })
    const json: AnyResponse = await res.json().catch(() => ({ error: 'no JSON' }))
    setContextResult({ status: res.status, body: json })
  }

  useEffect(() => {
    refreshContext()
  }, [])

  async function callAction(
    label: string,
    init: { url: string; method: 'POST'; body?: object },
  ) {
    setLoading(true)
    try {
      const res = await fetch(init.url, {
        method: init.method,
        headers: { 'Content-Type': 'application/json' },
        body: init.body ? JSON.stringify(init.body) : undefined,
      })
      const json: AnyResponse = await res
        .json()
        .catch(() => ({ error: 'no JSON' }))
      setActionResult({ label, status: res.status, body: json })
      await refreshContext()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8 font-mono text-sm">
      <h1 className="text-xl font-bold">
        Impersonation Test Harness (delete in step 2)
      </h1>

      <p className="text-gray-600">
        Buttons POST to <code>/api/admin/impersonate</code> and{' '}
        <code>/api/admin/impersonate/exit</code>. The context panel polls{' '}
        <code>/api/admin/test-context</code> after every action.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={loading}
          onClick={() =>
            callAction('Impersonate Ben Zavitz (FP)', {
              url: '/api/admin/impersonate',
              method: 'POST',
              body: { role: 'fp', partnerId: BEN_ZAVITZ_FP_ID },
            })
          }
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Impersonate Ben Zavitz (FP)
        </button>

        <button
          disabled={loading}
          onClick={() =>
            callAction('Impersonate Domenic Tersigni (Investor)', {
              url: '/api/admin/impersonate',
              method: 'POST',
              body: { role: 'investor', partnerId: DOMENIC_INVESTOR_ID },
            })
          }
          className="rounded bg-purple-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Impersonate Domenic Tersigni (Investor)
        </button>

        <button
          disabled={loading}
          onClick={() =>
            callAction('Exit Impersonation', {
              url: '/api/admin/impersonate/exit',
              method: 'POST',
            })
          }
          className="rounded bg-gray-700 px-4 py-2 text-white disabled:opacity-50"
        >
          Exit Impersonation
        </button>

        <button
          disabled={loading}
          onClick={() => refreshContext()}
          className="rounded border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          Refresh context
        </button>
      </div>

      <section>
        <h2 className="mb-2 font-bold">Last action response</h2>
        <pre className="overflow-x-auto rounded bg-gray-900 p-4 text-green-300">
          {actionResult ? JSON.stringify(actionResult, null, 2) : '(no action yet)'}
        </pre>
      </section>

      <section>
        <h2 className="mb-2 font-bold">/api/admin/test-context</h2>
        <pre className="overflow-x-auto rounded bg-gray-900 p-4 text-green-300">
          {contextResult ? JSON.stringify(contextResult, null, 2) : 'loading…'}
        </pre>
      </section>
    </div>
  )
}
