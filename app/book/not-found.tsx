// Where a /book URL that names nothing lands.
//
// This catches the WHOLE segment: a host slug that does not exist, an event type
// that was retired, a link that lost a character on its way through a chat app,
// and /book itself with nothing after it. All four are the same problem from the
// visitor's side — they followed a link to book a call and there is no call here
// to book — so they get the same card and the same two ways out.
//
// Before this file, `notFound()` in the page fell through to the framework's
// bare 404, which is a dead end on a page whose entire job is to start a
// conversation. The two links below are the point of the page.
//
// UNINDEXED, like the booking pages themselves.

import type { Metadata } from 'next'
import Nav from '@/components/nav'
import Footer from '@/components/footer'
import BookingNotice from '@/components/booking/BookingNotice'
import { CONTACT } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'We could not find that | Fox Mortgage',
  robots: { index: false, follow: false },
}

export default function BookNotFound() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        <section className="py-16 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <BookingNotice
              as="h1"
              title="We could not find that booking page"
              callHref={CONTACT.phone.href}
              callLabel={`Call ${CONTACT.phone.display}`}
              emailHref={CONTACT.email.href}
              emailLabel="Email us"
            >
              <p className="mb-2">
                The link may be old, or it may have lost a piece on the way here.
              </p>
              <p>Call or email and we will find you a time.</p>
            </BookingNotice>
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
