// ─── Demo FP support ───────────────────────────────────────────────────────────
// Mirrors app/portal/fp/support/page.tsx. Contact details are inlined (the demo
// stays self-contained; it does not import @/lib/contact). The "Book a Call" CTA
// uses a clearly-marked placeholder until Michael provides the real booking link.

import Link from 'next/link'
import { Phone, Mail, Calendar, MessageSquare } from 'lucide-react'
import { DEMO_BOOKING_URL } from '../_data/demo-data'

// Inlined contact details (matches lib/contact.ts values; kept local so the demo
// imports nothing from the live app).
const DEMO_CONTACT = {
  phone: { display: '519-226-8880', href: 'tel:+15192268880' },
  email: { address: 'mfox@foxmortgage.ca', href: 'mailto:mfox@foxmortgage.ca' },
}

export default function DemoFPSupportPage() {
  return (
    <div className="max-w-2xl">
      <p className="font-body text-sm text-gray-600 mb-8">
        Need to reach Michael? Use any of the options below.
      </p>

      {/* Contact cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <a
          href={DEMO_CONTACT.phone.href}
          className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
        >
          <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
            <Phone className="w-5 h-5 text-navy" />
          </div>
          <div>
            <div className="font-heading font-semibold text-navy text-sm">Call Michael</div>
            <div className="font-body text-xs text-gray-500">{DEMO_CONTACT.phone.display}</div>
          </div>
        </a>

        <a
          href={DEMO_CONTACT.email.href}
          className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
        >
          <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
            <Mail className="w-5 h-5 text-navy" />
          </div>
          <div>
            <div className="font-heading font-semibold text-navy text-sm">Email Michael</div>
            <div className="font-body text-xs text-gray-500">{DEMO_CONTACT.email.address}</div>
          </div>
        </a>

        {/* Book a Call — placeholder link until Michael provides the booking URL.
            DEMO_BOOKING_URL is "#" for now, so this is intentionally inert. */}
        <a
          href={DEMO_BOOKING_URL}
          className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
        >
          <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
            <Calendar className="w-5 h-5 text-navy" />
          </div>
          <div>
            <div className="font-heading font-semibold text-navy text-sm">Book a Call</div>
            <div className="font-body text-xs text-gray-500">Schedule time with Michael</div>
          </div>
        </a>

        <Link
          href="/demo/fp/messages"
          className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
        >
          <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
            <MessageSquare className="w-5 h-5 text-navy" />
          </div>
          <div>
            <div className="font-heading font-semibold text-navy text-sm">Send a Message</div>
            <div className="font-body text-xs text-gray-500">Use the portal inbox</div>
          </div>
        </Link>
      </div>

      {/* About Michael */}
      <div className="bg-navy text-white rounded-xl p-6">
        <h3 className="font-heading font-bold text-lg mb-2">Michael Fox</h3>
        <p className="font-body text-sm text-gray-300 mb-1">
          Mortgage Agent, Level 2 · BRX Mortgage
        </p>
        <p className="font-body text-xs text-gray-400 mb-4">FSRA #13463</p>
        <p className="font-body text-sm text-gray-300 leading-relaxed">
          Michael specializes in helping Canadians optimize their mortgage strategy through his
          Strategic Mortgage Monitoring program. He works closely with financial planners to ensure
          their clients&apos; mortgage positions are always aligned with their overall financial
          plan.
        </p>
      </div>
    </div>
  )
}
