// The client's status page (B5, 2026-07-17). A client opens a private link
// and sees where their file stands, in their own language.
//
// SECURITY POSTURE, in one place:
//   - The token IS the auth. It is 256 bits of opaque randomness, stored only
//     as a sha256, and it is the ONLY thing in the URL. No name, no file ref,
//     no id — nothing about the client is in the address bar, browser history,
//     or a referrer header.
//   - Invalid, expired, revoked, and never-existed all render the SAME quiet
//     page. This route must never be an oracle that confirms a token was once
//     real, or which files exist.
//   - force-dynamic + noindex (metadata here, X-Robots-Tag in next.config.js).
//     The service worker never caches anything under /portal (worker/sw.js
//     rule 3 short-circuits it to network-only before any cache read), so a
//     client's page is never written to Cache Storage. Verified, not assumed.
//   - The page renders NO judgment: no qualification, no rate, no decline.
//     See the rules in config/lifecycle.ts's client-words layer.

import type { Metadata } from 'next'
import { hashClientToken, isClientTokenShape } from '@/lib/client-links'
import { resolveClientLink, touchClientLink } from '@/lib/client-links-store'
import { getClientFileView, type ClientFileView } from '@/lib/client-file'
import { demoClientFileView } from '@/lib/demo-fixtures'
import { isDemoMode } from '@/lib/demo'
import ClientFilePage from './ClientFilePage'
import NotFoundCard from './NotFoundCard'

export const dynamic = 'force-dynamic'

// Static, never generateMetadata: interpolating the client's name into the
// title would put it in their browser tab, their history, and any screen
// share. The page is personal; its title is not.
export const metadata: Metadata = {
  title: 'Your mortgage file | Fox Mortgage',
  robots: { index: false, follow: false },
}

export default async function ClientTokenPage({ params }: { params: { token: string } }) {
  const view = await loadView(params.token)
  if (!view) return <NotFoundCard />
  return <ClientFilePage view={view} />
}

async function loadView(token: string): Promise<ClientFileView | null> {
  // Shape gate before any I/O. Also keeps the token dot-free, which matters:
  // Clerk's middleware matcher skips any path ending in `.<word>`.
  if (!isClientTokenShape(token)) return null

  // Demo mode renders the synthetic file from a fixed demo token, so the page
  // can be shown without a real client's link ever being opened.
  if (isDemoMode()) return demoClientFileView(token)

  const resolved = await resolveClientLink(hashClientToken(token))
  if (!resolved.configured || !resolved.ok || !resolved.data) return null

  const view = await getClientFileView(resolved.data.zohoDealId)
  if (!view) return null

  // Best effort, after the read: a failed stamp never costs the client their
  // page.
  await touchClientLink(resolved.data.id)
  return view
}
