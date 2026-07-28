// Where a confirmation email's "change or cancel" link lands.
//
// THE TOKEN IS THE AUTH, the same model the client status page uses: a 256-bit
// opaque value, stored only as a sha256, shape-gated before any lookup. There is
// no account and there never will be, because asking someone to sign in to move
// a phone call is asking too much.
//
// FOUR DEAD ENDS, AND ONLY ONE OF THEM IS VAGUE (session three).
//
// A token that does not RESOLVE renders one identical not-found card whether it
// was mistyped, revoked, or never existed. That vagueness is deliberate and load
// bearing: distinguishing them would turn this page into an oracle for guessing
// tokens.
//
// The other three are NOT vague, and telling them apart leaks nothing, because
// the token already resolved — the reader has proven they hold the capability,
// so there is nothing left to withhold from them. Someone whose call already
// happened, someone who cancelled last week, and someone whose booking was
// closed out deserve three different sentences rather than one shrug.
//
// The fifth case, a booking too close to now to change online, keeps the
// appointment on screen and swaps the controls for the honest line, because
// hiding the details of a call that is happening in ninety minutes is the one
// thing that would actually make someone late.

import type { Metadata } from 'next'
import Nav from '@/components/nav'
import Footer from '@/components/footer'
import BookingNotice from '@/components/booking/BookingNotice'
import { bookingForToken, SELF_SERVE_CUTOFF_HOURS } from '@/lib/booking/engine'
import { isoMs } from '@/lib/booking/time'
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

const CALL = { callHref: CONTACT.phone.href, callLabel: `Call ${CONTACT.phone.display}` }
const EMAIL = { emailHref: CONTACT.email.href, emailLabel: 'Email us' }

export default async function ManageBookingPage({ params }: { params: { token: string } }) {
  const booking = await bookingForToken(params.token ?? '')

  // ── The vague one. Every unresolvable token looks the same from out here. ──
  if (!booking) {
    return (
      <Shell>
        <BookingNotice as="h1" title="We could not find that" {...CALL} {...EMAIL}>
          <p>
            This link may be old, or it may have been typed in wrong. Call or email and we will find
            your appointment.
          </p>
        </BookingNotice>
      </Shell>
    )
  }

  const now = Date.now()
  const endMs = isoMs(booking.endsAt)
  const startMs = isoMs(booking.startsAt)

  // ── Already used, in the sense that the call has been and gone. ──
  // Checked BEFORE status, because "your call was on Tuesday" is a more useful
  // sentence than "that booking is closed" for a booking that simply happened.
  if (booking.status === 'booked' && endMs !== null && endMs <= now) {
    return (
      <Shell>
        <BookingNotice as="h1" title="That call has already happened" {...CALL} {...EMAIL}>
          <p className="mb-2">
            There is nothing left to change on this one. If you want to talk again, call or email and
            we will get you booked.
          </p>
          <p>If you two did not manage to connect, let us know and we will try again.</p>
        </BookingNotice>
      </Shell>
    )
  }

  // ── Already cancelled. ──
  if (booking.status === 'cancelled') {
    return (
      <Shell>
        <BookingNotice as="h1" title="That is already cancelled" {...CALL} {...EMAIL}>
          <p>
            Nothing else to do. If you want a new time, call or email {booking.hostDisplayName} and we
            will get you back in.
          </p>
        </BookingNotice>
      </Shell>
    )
  }

  // ── Closed out some other way. Rare, and honest about being rare. ──
  if (booking.status !== 'booked') {
    return (
      <Shell>
        <BookingNotice as="h1" title="That booking is not open any more" {...CALL} {...EMAIL}>
          <p>
            We cannot change this one from here. Call or email and we will sort out a new time with
            you.
          </p>
        </BookingNotice>
      </Shell>
    )
  }

  // ── Live. Too close to now is a state of the page, not a dead end. ──
  const tooLate = startMs !== null && startMs - now < SELF_SERVE_CUTOFF_HOURS * 3_600_000

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
        tooLate={tooLate}
        fallbackPhone={CONTACT.phone.display}
        fallbackPhoneHref={CONTACT.phone.href}
        fallbackEmail={CONTACT.email.address}
        fallbackEmailHref={CONTACT.email.href}
      />
    </Shell>
  )
}
