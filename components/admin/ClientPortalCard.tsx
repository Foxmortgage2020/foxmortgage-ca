'use client'

// The deal room's Client portal card (B5). Michael creates a private link,
// copies it into his own message, and revokes it when he wants it dead.
//
// v1 SENDS NOTHING. There is no email path here on purpose: Michael pastes
// the link into whatever he was already writing. Automated delivery is the
// comms phase, and it needs its own thinking about consent and deliverability.
//
// THE RAW TOKEN EXISTS ONCE. The create response carries it, this component
// holds it in memory to be copied, and it is gone on refresh — only its hash
// was stored. That is why the fresh link is shown prominently and the older
// ones only ever show metadata.

import { useState } from 'react'
import StatusChip from '@/components/admin/ds/StatusChip'
import type { ClientLinkSummary } from '@/lib/client-links-store'

function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function state(link: ClientLinkSummary): { tone: 'green' | 'gray' | 'amber'; label: string } {
  if (link.revokedAt) return { tone: 'gray', label: 'revoked' }
  if (new Date(link.expiresAt).getTime() <= Date.now()) return { tone: 'amber', label: 'expired' }
  return { tone: 'green', label: 'live' }
}

export default function ClientPortalCard({
  zohoDealId,
  fileRef,
  initialLinks,
  canManage,
}: {
  zohoDealId: string | null
  fileRef: string | null
  initialLinks: ClientLinkSummary[]
  canManage: boolean
}) {
  const [links, setLinks] = useState<ClientLinkSummary[]>(initialLinks)
  const [fresh, setFresh] = useState<{ url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [armed, setArmed] = useState<string | null>(null)

  if (!zohoDealId) {
    return (
      <p className="font-ui text-[13px] text-cool-600">
        This file has no linked Zoho deal, so there is nothing to show a client yet.
      </p>
    )
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/admin/client-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ zohoDealId, fileRef }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message ?? `Could not create the link (HTTP ${res.status}).`)
        return
      }
      setFresh({ url: `${window.location.origin}/portal/file/${data.token}` })
      setCopied(false)
      setLinks(prev => [
        {
          id: data.id,
          zohoDealId,
          fileRef,
          createdBy: 'you',
          createdAt: new Date().toISOString(),
          expiresAt: data.expiresAt,
          revokedAt: null,
          lastViewedAt: null,
        },
        ...prev,
      ])
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    if (armed !== id) {
      setArmed(id)
      return
    }
    setArmed(null)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/admin/client-links/${id}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ zohoDealId, fileRef }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.message ?? `Could not revoke the link (HTTP ${res.status}).`)
        return
      }
      setLinks(prev =>
        prev.map(l => (l.id === id ? { ...l, revokedAt: new Date().toISOString() } : l)),
      )
      setFresh(null)
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-ui text-[13px] leading-relaxed text-cool-700">
        A private link that shows this client where their file stands, in plain words. Nothing sends
        on its own: copy the link into your own message. It lasts 90 days and you can turn it off
        any time.
      </p>

      {canManage && (
        <div>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="rounded-md bg-navy px-3 py-1.5 font-ui text-[13px] font-semibold text-white disabled:opacity-50"
            data-testid="client-link-create"
          >
            {busy ? 'Working…' : 'Create a link'}
          </button>
        </div>
      )}

      {error && <p className="font-ui text-[13px] text-danger">{error}</p>}

      {fresh && (
        <div className="rounded-[9px] border border-cool-200 bg-cool-50 p-3">
          <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-600">
            Copy it now
          </p>
          <p className="mt-1 font-ui text-[11px] text-cool-600">
            This is the only time the link is shown. It is stored hashed, so it cannot be read back
            — if you lose it, just make another.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-cool-200 bg-white px-2 py-1.5 font-ui text-[11px] text-navy">
              {fresh.url}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(fresh.url)
                setCopied(true)
              }}
              className="rounded-md border border-cool-300 px-3 py-1.5 font-ui text-[12px] font-semibold text-navy hover:border-navy"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <ul className="flex flex-col divide-y divide-cool-100">
          {links.map(l => {
            const s = state(l)
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <StatusChip tone={s.tone}>{s.label}</StatusChip>
                <span className="font-ui text-[12px] text-cool-600 tabular-nums">
                  made {fmt(l.createdAt)} · ends {fmt(l.expiresAt)}
                </span>
                <span className="font-ui text-[12px] text-cool-500 tabular-nums">
                  {l.lastViewedAt ? `opened ${fmt(l.lastViewedAt)}` : 'not opened yet'}
                </span>
                {canManage && !l.revokedAt && (
                  <button
                    type="button"
                    onClick={() => revoke(l.id)}
                    disabled={busy}
                    className={`ml-auto rounded-md px-2.5 py-1 font-ui text-[12px] font-semibold disabled:opacity-50 ${
                      armed === l.id
                        ? 'bg-danger text-white'
                        : 'border border-cool-300 text-navy hover:border-navy'
                    }`}
                    data-testid={`client-link-revoke-${l.id}`}
                  >
                    {armed === l.id ? 'Tap again to turn it off' : 'Turn off'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
