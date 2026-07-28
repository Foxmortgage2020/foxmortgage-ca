// Where a confirmation email's "change or cancel" link lands.
//
// THE TOKEN IS THE AUTH, the same model the client status page uses: a 256-bit
// opaque value, stored only as a sha256, shape-gated before any lookup. There is
// no account and there never will be, because asking someone to sign in to move
// a phone call is asking too much.
//
// Anything that does not resolve renders ONE identical not-found card. A wrong
// token, an expired one, and one that never existed are indistinguishable from
// the outside, so the page is not an oracle for guessing tokens.

import type { Metadata } from 'next'
import Nav from '@/components/nav'
import Footer from '@/components/footer'
import { bookingForToken } from '@/lib/booking/engine'
import { CONTACT } from '@/lib/contact'
import ManageFlow from './ManageFlow'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your appointment | Fox Mortgage',
  robots: { index: false, follow: false },
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        <section className="py-16 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
        </section>
      </div>
      <Footer />
    </main>
  )
}

export default async function ManageBookingPage({ params }: { params: { token: string } }) {
  const booking = await bookingForToken(params.token ?? '')

  if (!booking) {
    return (
      <Shell>
        <div className="border border-gray-200 rounded-2xl p-10 text-center">
          <h1 className="font-heading font-bold text-navy text-2xl mb-3">We could not find that</h1>
          <p className="font-body text-gray-600 text-sm mb-6">
            This link may be old, or it may have been typed in wrong. Give us a call and we will find
            your appointment.
          </p>
          <a
            href={CONTACT.phone.href}
            className="inline-block bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-all"
          >
            Call {CONTACT.phone.display}
          </a>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <ManageFlow
        token={params.token}
        status={booking.status}
        startsAt={booking.startsAt}
        endsAt={booking.endsAt}
        eventName={booking.eventTypeName ?? 'your call'}
        hostName={booking.hostDisplayName}
        hostTimezone={booking.hostTimezone}
        clientTimezone={booking.clientTimezone}
        clientName={booking.clientName}
        durationMinutes={booking.durationMinutes}
        fallbackPhone={CONTACT.phone.display}
        fallbackPhoneHref={CONTACT.phone.href}
        fallbackEmail={CONTACT.email.address}
      />
    </Shell>
  )
}
