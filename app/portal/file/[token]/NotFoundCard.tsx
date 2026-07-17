// The one page every unusable link renders: malformed, unknown, expired,
// revoked, or a deal that cannot be read. They are deliberately
// indistinguishable — if this page said "expired" for a real token and
// "not found" for a random one, it would confirm which tokens were once real.
//
// It is also warm. A client whose link stopped working did nothing wrong, and
// the page should not read like a locked door.

import { CONTACT } from '@/lib/contact'
import ClientFooter from './ClientFooter'

export default function NotFoundCard() {
  return (
    <main className="min-h-screen bg-[#F7F9FA] px-5 py-16">
      <div className="mx-auto w-full max-w-md">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-navy/50">
          Fox Mortgage
        </p>
        <h1 className="mt-4 font-heading text-2xl font-bold text-navy sm:text-3xl">
          This link isn&rsquo;t working
        </h1>
        <p className="mt-4 font-body text-[15px] leading-relaxed text-navy/70">
          Links expire after a while, and Michael can send you a fresh one in a moment. Nothing is
          wrong with your file.
        </p>

        <div className="mt-8 rounded-2xl border border-navy/10 bg-white p-6">
          <p className="font-heading text-sm font-bold text-navy">Get a new link</p>
          <div className="mt-4 flex flex-col gap-2">
            <a
              href={CONTACT.email.href}
              className="rounded-xl bg-navy px-5 py-3 text-center font-heading text-sm font-bold text-white"
            >
              Email Michael
            </a>
            <a
              href={CONTACT.phone.href}
              className="rounded-xl border border-navy/15 px-5 py-3 text-center font-heading text-sm font-bold text-navy"
            >
              Call {CONTACT.phone.display}
            </a>
          </div>
        </div>

        <ClientFooter />
      </div>
    </main>
  )
}
