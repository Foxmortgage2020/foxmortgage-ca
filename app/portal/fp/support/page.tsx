'use client'

import Link from 'next/link'
import { Phone, Mail, Calendar, MessageSquare } from 'lucide-react'

export default function FPSupportPage() {
  return (
    <div className="max-w-2xl">
      <p className="font-body text-sm text-gray-600 mb-8">
        Need to reach Michael? Use any of the options below.
      </p>

      {/* Contact cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <a
          href="tel:+14165550100"
          className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
        >
          <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
            <Phone className="w-5 h-5 text-navy" />
          </div>
          <div>
            <div className="font-heading font-semibold text-navy text-sm">Call Michael</div>
            <div className="font-body text-xs text-gray-500">416-555-0100</div>
          </div>
        </a>

        <a
          href="mailto:michael@foxmortgage.ca"
          className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
        >
          <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
            <Mail className="w-5 h-5 text-navy" />
          </div>
          <div>
            <div className="font-heading font-semibold text-navy text-sm">Email Michael</div>
            <div className="font-body text-xs text-gray-500">michael@foxmortgage.ca</div>
          </div>
        </a>

        <a
          href="https://calendly.com/foxmortgage"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
        >
          <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
            <Calendar className="w-5 h-5 text-navy" />
          </div>
          <div>
            <div className="font-heading font-semibold text-navy text-sm">Book a Call</div>
            <div className="font-body text-xs text-gray-500">Schedule time via Calendly</div>
          </div>
        </a>

        <Link
          href="/portal/fp/messages"
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
          Mortgage Agent, Level 2 — BRX Mortgage
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
