// The public booking page: /book/<host>/<event-type>.
//
// THE URL CARRIES THE HOST FROM DAY ONE. /book/mike/strategy-session works now,
// and /book/<someone-else>/<type> works the moment a second host row exists. There
// is no URL migration waiting to happen and no single-tenant shortcut to unpick.
//
// Server component: it resolves the host and event type through the store (which
// holds the operator secret) and hands the client component only what a visitor
// may see. No secret, no agent id beyond what the confirm route re-derives itself,
// no other client's anything.
//
// UNLINKED THIS SESSION. Nothing in the public nav points here, by instruction —
// the page is reachable by direct link so it can be exercised end to end before
// the drip and the site start sending people to it.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Nav from '@/components/nav'
import Footer from '@/components/footer'
import { loadConfig } from '@/lib/booking/engine'
import { readPrefill } from '@/lib/booking/tokens'
import { getContactForPrefill } from '@/lib/booking/zoho-link'
import { CONTACT } from '@/lib/contact'
import BookingFlow from './BookingFlow'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/

interface PageProps {
  params: { host: string; eventType: string }
  searchParams: { k?: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const host = params.host?.toLowerCase() ?? ''
  const event = params.eventType?.toLowerCase() ?? ''
  if (!SLUG_RE.test(host) || !SLUG_RE.test(event)) {
    return { title: 'Book a time | Fox Mortgage' }
  }
  const config = await loadConfig(host, event)
  if (!config) return { title: 'Book a time | Fox Mortgage' }
  return {
    title: `${config.eventType.name} with ${config.host.displayName} | Fox Mortgage`,
    description:
      config.eventType.description ??
      `Pick a time that works for you. ${config.host.displayName} will call you.`,
    // Not indexed while the engine is being proven. The page is reachable by
    // direct link and by the drip, and it is not a search landing page.
    robots: { index: false, follow: false },
  }
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const host = params.host?.toLowerCase() ?? ''
  const event = params.eventType?.toLowerCase() ?? ''
  if (!SLUG_RE.test(host) || !SLUG_RE.test(event)) notFound()

  const config = await loadConfig(host, event)
  if (!config) notFound()

  // SERVER-SIDE PREFILL. The link carries an opaque signed token holding record
  // ids and nothing else. The name, email, and number are fetched HERE and
  // rendered straight into the form, so no personal data ever rides the URL, the
  // token payload, or any client-side code path. A token that does not resolve,
  // or a contact we cannot read, simply means an empty form.
  const rawToken = typeof searchParams?.k === 'string' ? searchParams.k : null
  const claims = readPrefill(rawToken, Date.now())
  const prefill = claims?.zohoContactId ? await getContactForPrefill(claims.zohoContactId) : null

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        <section className="py-16 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-body text-lime text-sm uppercase tracking-wider mb-4">
                Book a time
              </p>
              <h1 className="font-heading font-bold text-4xl mb-4">{config.eventType.name}</h1>
              <p className="font-body text-gray-300 text-lg">
                {config.eventType.description ??
                  `Pick a time that works for you and ${config.host.displayName} will call you.`}
              </p>
              <p className="font-body text-gray-300 text-sm mt-4">
                {config.eventType.durationMinutes} minutes, by phone. {config.host.displayName} calls
                the number you give us.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <BookingFlow
              host={config.host.slug}
              event={config.eventType.slug}
              hostName={config.host.displayName}
              hostTimezone={config.host.timezone}
              eventName={config.eventType.name}
              durationMinutes={config.eventType.durationMinutes}
              intakeQuestions={config.eventType.intakeQuestions}
              prefillToken={rawToken}
              prefillName={prefill?.name ?? null}
              prefillEmail={prefill?.email ?? null}
              prefillPhone={prefill?.phone ?? null}
              fallbackPhone={CONTACT.phone.display}
              fallbackPhoneHref={CONTACT.phone.href}
              fallbackEmail={CONTACT.email.address}
              fallbackEmailHref={CONTACT.email.href}
            />
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
