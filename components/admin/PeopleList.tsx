'use client'

// People list (Session 8): everyone with portal access — roles, last
// sign-in, provisioned-by, status — and where offboarding starts. The
// Disable action is two-tap confirmed with the arm window enforced by
// timestamp at tap time (the Session 4 incident rule), admin-only behind
// people.manage on the server.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ShieldOff } from 'lucide-react'

export interface PersonRowView {
  clerkUserId: string
  name: string
  email: string
  roles: string[]
  lastSignInAt: number | null
  banned: boolean
  provisionedBy: string | null
  provisionedAt: string | null
  personType: string | null
  offboardId: string | null
}

const ARM_WINDOW_MS = 4000

function fmtLastSignIn(ms: number | null): string {
  if (!ms) return 'never'
  try {
    return new Date(ms).toLocaleString('en-CA', {
      timeZone: 'America/Toronto',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'never'
  }
}

export default function PeopleList({
  rows,
  currentUserId,
}: {
  rows: PersonRowView[]
  currentUserId: string
}) {
  const router = useRouter()
  const [armedId, setArmedId] = useState<string | null>(null)
  const armedAt = useRef<number>(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDisable = async (row: PersonRowView) => {
    // Two-tap: first tap arms; second tap inside the window fires. The
    // window is checked by timestamp at tap time so a throttled
    // background tab can never leave a button armed.
    const now = Date.now()
    if (armedId !== row.clerkUserId || now - armedAt.current > ARM_WINDOW_MS) {
      setArmedId(row.clerkUserId)
      armedAt.current = now
      setTimeout(() => {
        setArmedId(prev => (prev === row.clerkUserId ? null : prev))
      }, ARM_WINDOW_MS)
      return
    }
    setArmedId(null)
    setBusyId(row.clerkUserId)
    setError(null)
    try {
      const res = await fetch('/api/portal/admin/people/offboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkUserId: row.clerkUserId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Offboarding failed.')
        return
      }
      if (data.offboardId) {
        router.push(`/portal/admin/settings/people/offboard/${data.offboardId}`)
      }
      router.refresh()
    } catch {
      setError('Offboarding failed — network error.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-body text-red-700">
          {error}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm font-body min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="py-2.5 px-4 font-medium">Person</th>
              <th className="py-2.5 px-4 font-medium">Roles</th>
              <th className="py-2.5 px-4 font-medium">Last sign-in</th>
              <th className="py-2.5 px-4 font-medium">Provisioned by</th>
              <th className="py-2.5 px-4 font-medium">Status</th>
              <th className="py-2.5 px-4 font-medium text-right">Offboard</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isSelf = row.clerkUserId === currentUserId
              const armed = armedId === row.clerkUserId
              const busy = busyId === row.clerkUserId
              return (
                <tr
                  key={row.clerkUserId}
                  className="border-b border-gray-50 last:border-0"
                  data-testid={`person-${row.clerkUserId}`}
                >
                  <td className="py-2.5 px-4">
                    <p className="text-navy">{row.name || '—'}</p>
                    <p className="text-xs text-gray-400">{row.email}</p>
                  </td>
                  <td className="py-2.5 px-4">
                    {row.roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.roles.map(r => (
                          <span
                            key={r}
                            className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">no roles</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap">
                    {fmtLastSignIn(row.lastSignInAt)}
                  </td>
                  <td className="py-2.5 px-4 text-gray-500">
                    {row.provisionedBy ?? (
                      <span className="text-xs text-gray-400">pre-wizard (manual)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    {row.banned ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                        disabled
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-lime/20 text-navy">
                        active
                      </span>
                    )}
                    {row.offboardId && (
                      <Link
                        href={`/portal/admin/settings/people/offboard/${row.offboardId}`}
                        className="ml-2 text-xs text-navy underline hover:text-lime"
                      >
                        checklist
                      </Link>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {isSelf ? (
                      <span className="text-xs text-gray-400">you</span>
                    ) : row.banned ? (
                      <span className="text-xs text-gray-400">done</span>
                    ) : (
                      <button
                        onClick={() => handleDisable(row)}
                        disabled={busy}
                        data-testid={`offboard-${row.clerkUserId}`}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                          armed
                            ? 'bg-red-600 text-white border-red-600'
                            : 'border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600'
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldOff className="w-3.5 h-3.5" />
                        )}
                        {armed ? 'Tap again to disable' : 'Disable'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-400 font-body">
        Disable bans the Clerk user and revokes every live session in one action, then opens
        the offboarding checklist. Nothing deletes — audit history, provisioning records, and
        view-as logs remain.
      </p>
    </div>
  )
}
