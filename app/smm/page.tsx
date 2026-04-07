'use client'

import { useState } from 'react'
import Nav from '@/components/nav'
import Link from 'next/link'
import Script from 'next/script'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'wistia-player': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'media-id'?: string
          aspect?: string
        },
        HTMLElement
      >
    }
  }
}

// ─── Inline icons ─────────────────────────────────────────────────────────────

const CheckIcon = ({ className = '' }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.085l6.79-6.795a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`h-5 w-5 text-[#95D600] transition-transform duration-300 ${
      open ? 'rotate-180' : 'rotate-0'
    }`}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
)

// ─── FAQ data ────────────────────────────────────────────────────────────────

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is this really free?',
    a: 'Yes. Strategic Mortgage Monitoring is included as part of how we manage mortgages long-term. There is no subscription, no fee, and no obligation to act on anything. Michael earns income only if you choose to act on an opportunity he surfaces. Only then.',
  },
  {
    q: 'What do you do with my mortgage information?',
    a: 'Your information is used only to monitor your mortgage and contact you when a genuine opportunity exists. It is stored securely and compliant with Canadian privacy law (PIPEDA). It is never sold or shared with third parties. You can request removal at any time.',
  },
  {
    q: 'Will I get constant calls trying to sell me something?',
    a: "No. You'll receive a monthly homeownership report tracking your home value, equity position, and rate environment. Beyond that, Michael reaches out only when a specific, actionable savings opportunity exists for your mortgage. If your mortgage is performing well, you may not hear from him beyond the monthly report. That means the monitoring is working.",
  },
  {
    q: 'Do I need to switch lenders or renew early to benefit?',
    a: 'Not necessarily. Many opportunities involve your existing lender. You are never obligated to act on anything Michael surfaces. The value is awareness. Knowing what exists before your renewal window closes.',
  },
  {
    q: 'Is Michael licensed and regulated?',
    a: 'Yes. Michael Fox is a Mortgage Agent, Level 2, licensed by the Financial Services Regulatory Authority of Ontario (FSRA #13463) and operating under BRX Mortgage. All activities comply with the Mortgage Brokerages, Lenders and Administrators Act, 2006.',
  },
]

// ─── Trust bar items ─────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  '73 Ontario mortgages monitored',
  'Monthly homeownership report delivered to you',
  'No cost to enroll. No hidden fees.',
  'Michael Fox · Mortgage Agent, Level 2 · FSRA #13463',
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SMMPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <main className="min-h-screen bg-white font-body text-[#032133]">
      <Nav />
      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 - HERO
          ════════════════════════════════════════════════════════════════════ */}
      <section className="bg-[#032133] text-white pt-16">
        <div className="mx-auto max-w-5xl px-4 pt-20 pb-12 sm:px-6 sm:pt-24 lg:px-8">
          <div className="text-center">
            <h1 className="font-heading text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
              Your mortgage, watched every day.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-200 sm:text-xl">
              We monitor your mortgage continuously and let you know when something is
              worth acting on. Not when it&apos;s urgent. When it&apos;s early.
            </p>

            <div className="mt-10">
              <Link
                href="/smm/enroll"
                className="inline-block w-full rounded-xl bg-[#95D600] px-8 py-4 text-center font-heading text-base font-bold text-[#032133] shadow-lg transition-transform hover:scale-[1.02] sm:w-auto sm:text-lg"
              >
                Enroll Free. Takes 2 Minutes →
              </Link>
            </div>
          </div>
        </div>

        {/* Trust bar */}
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {TRUST_ITEMS.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#95D600]" />
                  <span className="text-sm leading-snug text-white">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1.5 - WHY THIS EXISTS
          ════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="font-heading text-2xl font-bold text-[#032133] sm:text-3xl">
            Most mortgage advice is transactional.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-gray-600">
            You get help when you buy. When you refinance. When you renew.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-gray-600">
            But between those moments, things change.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-gray-600">
            Rates move. Opportunities appear. And sometimes the best options pass quietly.
          </p>
          <p className="mt-10 font-heading text-2xl font-bold text-[#032133] sm:text-3xl">
            Strategic Mortgage Monitoring exists to make sure that doesn&apos;t happen.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 - THE PROBLEM
          ════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <p className="text-center text-xl leading-relaxed text-[#032133] sm:text-2xl">
            Most homeowners assume their mortgage is fine until something forces a
            decision.
          </p>
          <p className="mt-6 text-center text-xl leading-relaxed text-[#032133] sm:text-2xl">
            The biggest opportunities and the biggest mistakes happen between those
            decision points.
          </p>
        </div>
      </section>

      <section className="w-full bg-white pt-6 pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <style>{`
            wistia-player[media-id='kaon6ntu81']:not(:defined) {
              background: center / contain no-repeat
                url('https://fast.wistia.com/embed/medias/kaon6ntu81/swatch');
              display: block;
              filter: blur(5px);
              padding-top: 56.25%;
            }
          `}</style>
          {/* @ts-ignore - wistia-player is a custom web component */}
          <wistia-player
            media-id="kaon6ntu81"
            aspect="1.7777777777777777"
            className="w-full rounded-2xl overflow-hidden"
          />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 - HOW IT WORKS
          ════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-center font-heading text-3xl font-bold text-[#032133] sm:text-4xl">
            Here&apos;s how it works
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                num: '01',
                title: 'Enroll in 2 minutes',
                body: 'Share your current rate, lender, balance, and renewal date. No documents. No commitment.',
              },
              {
                num: '02',
                title: 'We monitor every day',
                body: 'Every morning, your mortgage is checked against current market rates, lender offers, and your upcoming renewal window.',
              },
              {
                num: '03',
                title: 'You hear from us when it matters',
                body: "Each month you receive a homeownership report. We reach out directly only when there's a genuine savings opportunity worth your attention.",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="rounded-2xl bg-[#032133] p-8 text-white shadow-md"
              >
                <div className="font-heading text-4xl font-bold text-[#95D600]">
                  {step.num}
                </div>
                <h3 className="mt-4 font-heading text-xl font-bold text-white">
                  {step.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-gray-200">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3.5 - WHAT WE WATCH
          ════════════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-[#032133] text-white">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-center font-heading text-2xl font-bold text-white">
            Behind the scenes, here is what we are watching
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-2">
            {[
              {
                label: 'MARKET RATES',
                body: 'Changes in current rates relative to what you are paying.',
              },
              {
                label: 'RENEWAL WINDOW',
                body: 'Your remaining term and the optimal time to start planning.',
              },
              {
                label: 'PENALTY STRUCTURE',
                body: 'Whether breaking early would cost more than it saves.',
              },
              {
                label: 'EQUITY POSITION',
                body: 'Refinancing opportunities based on your current home value.',
              },
            ].map((item) => (
              <div key={item.label}>
                <div className="font-heading text-sm font-bold tracking-wider text-[#95D600]">
                  {item.label}
                </div>
                <p className="mt-2 text-base leading-relaxed text-white">{item.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-12 text-center text-sm italic text-white">
            Not to create action. To make sure nothing important is missed.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 - SOCIAL PROOF (PLACEHOLDER)
          ════════════════════════════════════════════════════════════════════ */}
      {/* TESTIMONIALS PLACEHOLDER - Michael to supply 2-3 real client quotes
          with permission before this section goes live. Format:
          { name: string, city: string, quote: string, outcome: string } */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-center font-heading text-3xl font-bold text-[#032133] sm:text-4xl">
            What SMM members are saying
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {[
              {
                initials: 'JS',
                name: 'J. Smith',
                city: 'Guelph, ON',
                quote: 'Placeholder. Real testimonial coming soon.',
                outcome: 'Savings opportunity identified before renewal',
              },
              {
                initials: 'JS',
                name: 'J. Smith',
                city: 'Guelph, ON',
                quote: 'Placeholder. Real testimonial coming soon.',
                outcome: 'Savings opportunity identified before renewal',
              },
            ].map((t, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#032133]">
                    <span className="font-heading text-base font-bold text-[#95D600]">
                      {t.initials}
                    </span>
                  </div>
                  <div>
                    <div className="font-heading font-bold text-[#032133]">
                      {t.name}
                    </div>
                    <div className="text-sm text-gray-500">{t.city}</div>
                  </div>
                </div>
                <p className="mt-5 text-base leading-relaxed text-[#032133]">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-5 inline-block rounded-full bg-[#95D600]/10 px-3 py-1 text-xs font-bold text-[#032133]">
                  {t.outcome}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-12 text-center text-base text-gray-600">
            73 Ontario households enrolled. Monitored across Wellington County,
            Guelph, GTA, Hamilton, and beyond.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 5 - FAQ
          ════════════════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-center font-heading text-3xl font-bold text-[#032133] sm:text-4xl">
            Questions we get asked
          </h2>

          <div className="mt-12 space-y-4">
            {FAQS.map((faq, i) => {
              const open = openFaq === i
              return (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    aria-controls={`faq-panel-${i}`}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className="font-heading text-base font-bold text-[#032133] sm:text-lg">
                      {faq.q}
                    </span>
                    <ChevronIcon open={open} />
                  </button>
                  <div
                    id={`faq-panel-${i}`}
                    className={`grid overflow-hidden bg-white transition-all duration-300 ease-in-out ${
                      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-base leading-relaxed text-[#032133]">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 6 - FINAL CTA
          ════════════════════════════════════════════════════════════════════ */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-heading text-3xl font-bold text-[#032133] sm:text-4xl">
            Enroll in 2 minutes. It&apos;s free.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Ontario homeowners only. Takes less time than making a coffee.
          </p>

          <p className="mt-10 mb-8 text-center font-heading text-xl text-[#032133]">
            Most people do not need to change their mortgage. They just need to know
            when they should.
          </p>

          <div>
            <Link
              href="/smm/enroll"
              className="inline-block w-full rounded-xl bg-[#95D600] px-8 py-4 text-center font-heading text-base font-bold text-[#032133] shadow-lg transition-transform hover:scale-[1.02] sm:w-auto sm:text-lg"
            >
              Start Monitoring →
            </Link>
          </div>

          <p className="mt-6 text-sm text-gray-500">
            No cost. No commitment. Cancel anytime by emailing michael@foxmortgage.ca
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 7 - FOOTER COMPLIANCE STRIP
          ════════════════════════════════════════════════════════════════════ */}
      <footer className="bg-[#032133] text-white">
        <div className="mx-auto max-w-5xl px-4 py-10 text-center text-xs leading-relaxed text-gray-300 sm:px-6 lg:px-8">
          <p>
            Fox Mortgage · Michael Fox, Mortgage Agent, Level 2 · BRX Mortgage ·
            FSRA #13463 · Fergus · Guelph · Wellington County · Ontario
          </p>
          <p className="mt-2">
            Not intended to solicit clients already under contract.
          </p>
          <p className="mt-3">
            <Link href="/privacy" className="underline hover:text-[#95D600]">
              Privacy Policy
            </Link>
            <span className="mx-2 text-gray-500">|</span>
            <Link href="/contact" className="underline hover:text-[#95D600]">
              Contact
            </Link>
          </p>
        </div>
      </footer>

      <Script src="https://fast.wistia.com/player.js" strategy="afterInteractive" />
      <Script
        src="https://fast.wistia.com/embed/kaon6ntu81.js"
        strategy="afterInteractive"
        type="module"
      />
    </main>
  )
}
