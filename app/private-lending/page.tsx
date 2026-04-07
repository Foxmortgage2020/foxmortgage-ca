'use client'

import { useState } from 'react'
import Nav from '@/components/nav'
import Footer from '@/components/footer'
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

export default function PrivateLendingPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-16">
        <Hero />
        <StatsBar />
        <WhatIsPrivateLending />
        <BorrowerProfiles />
        <HowItWorks />
        <TypesOfDeals />
        <ReturnsStructure />
        <RiskProtection />
        <LegalSecurity />
        <DealBreakdown />
        <WhoThisIsFor />
        <HowToGetStarted />
        <FAQ />
        <InvestorForm />
        <p className="text-center text-xs text-gray-400 py-6 px-4 max-w-4xl mx-auto font-body">
          Michael Fox &middot; Mortgage Agent, Level 2 &middot; BRX Mortgage &middot; FSRA #13463. Private mortgage investments carry risk. There is no guarantee of returns or return of principal. Past deal outcomes do not predict future results. This page is for informational purposes only and does not constitute investment advice. Investments are not insured by CDIC or any government agency.
        </p>
      </div>
      <Footer />
      <Script src="https://fast.wistia.com/player.js" strategy="afterInteractive" />
      <Script
        src="https://fast.wistia.com/embed/n2tpukpv2u.js"
        strategy="afterInteractive"
        type="module"
      />
    </main>
  )
}

/* ─────────────── SECTION 1 — HERO ─────────────── */
function Hero() {
  return (
    <section className="bg-navy text-white pt-24 pb-20 px-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
        <div className="lg:col-span-3">
          <p className="font-body text-lime text-xs uppercase tracking-widest mb-4">Private Mortgage Investing &middot; Ontario, Canada</p>
          <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl leading-tight mb-6">Earn 9&ndash;14% Returns Secured by Ontario Real Estate</h1>
          <p className="font-body text-gray-300 text-lg mb-8 max-w-xl">Deploy capital into first and second position mortgages backed by registered charges on residential and commercial properties across Ontario.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="#investor-form" className="border border-white text-white font-heading font-bold text-sm px-6 py-3 rounded-lg hover:bg-white/10 transition-colors">Download Investor Guide</Link>
            <Link href="#how-it-works" className="bg-lime text-navy font-heading font-bold text-sm px-6 py-3 rounded-lg hover:bg-lime-dark transition-colors">See How It Works</Link>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="w-full rounded-2xl overflow-hidden">
            <style>{`
              wistia-player[media-id='n2tpukpv2u']:not(:defined) {
                background: center / contain no-repeat
                  url('https://fast.wistia.com/embed/medias/n2tpukpv2u/swatch');
                display: block;
                filter: blur(5px);
                padding-top: 56.25%;
              }
            `}</style>
            {/* @ts-ignore - wistia-player is a custom web component */}
            <wistia-player
              media-id="n2tpukpv2u"
              aspect="1.7777777777777777"
              className="w-full"
            />
          </div>
          <p className="text-lime text-xs mt-3 text-center">Private Lending Explained</p>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 2 — STATS BAR ─────────────── */
function StatsBar() {
  const stats = [
    { value: '$47M+', label: 'Capital Deployed' },
    { value: '11.2%', label: 'Average Annual Return' },
    { value: 'Zero', label: 'Investor Losses Since 2018' },
  ]
  return (
    <section className="bg-navy border-t border-white/10 py-10 px-4">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-white/10">
        {stats.map((s) => (
          <div key={s.label} className="text-center px-12">
            <div className="font-heading text-4xl text-lime">{s.value}</div>
            <div className="font-body text-xs text-gray-400 uppercase tracking-wider mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─────────────── SECTION 3 — WHAT IS PRIVATE LENDING ─────────────── */
function WhatIsPrivateLending() {
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">The Fundamentals</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-12">What Is Private Mortgage Lending?</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-5 font-body text-gray-600 leading-relaxed">
            <p>Private mortgage lending fills the gap between traditional bank financing and borrower needs. When banks decline or can&apos;t move fast enough, private capital steps in &mdash; secured by registered charges on real property.</p>
            <p>You become the lender. Your capital is protected by a legal charge registered on title. The borrower pays monthly interest. At maturity, they repay principal through refinancing, sale, or renewal.</p>
            <p>Every deal is underwritten individually. Every property is independently appraised. Every mortgage is registered through a licensed Ontario lawyer.</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-3">
            {[
              { icon: '🏦', label: 'Traditional Bank', sub: 'Declines or delays', highlight: false },
              { icon: '💰', label: 'Private Lender', sub: 'Provides capital', highlight: true },
              { icon: '👤', label: 'Borrower', sub: 'Secures financing', highlight: false },
            ].map((row, i) => (
              <div key={row.label}>
                <div className={`flex items-center gap-4 rounded-lg p-3 ${row.highlight ? 'bg-lime/10 border border-lime/30' : 'bg-gray-100'}`}>
                  <span className="text-2xl">{row.icon}</span>
                  <div>
                    <div className="font-heading font-bold text-navy text-sm">{row.label}</div>
                    <div className="font-body text-gray-500 text-xs">{row.sub}</div>
                  </div>
                </div>
                {i < 2 && <div className="flex justify-center py-1"><span className="text-gray-300 text-lg">&darr;</span></div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 4 — BORROWER PROFILES ─────────────── */
function BorrowerProfiles() {
  const profiles = [
    { icon: '💼', title: 'Self-Employed', desc: 'Strong income but non-traditional documentation. Banks require 2 years of tax returns.' },
    { icon: '🔨', title: 'Developers', desc: 'Need construction financing or bridge capital between project phases.' },
    { icon: '⏱️', title: 'Time-Sensitive', desc: 'Need to close in 7\u201314 days. Banks can\u2019t move that fast.' },
    { icon: '📈', title: 'Credit Events', desc: 'Recent credit challenges but strong equity position and clear exit strategy.' },
  ]
  return (
    <section className="bg-gray-50 py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Who Borrows</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-4">Common Borrower Profiles</h2>
        <p className="font-body text-gray-600 mb-10 max-w-2xl">Private lending isn&apos;t for distressed borrowers &mdash; it&apos;s for creditworthy individuals in circumstances banks won&apos;t accommodate.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {profiles.map((p) => (
            <div key={p.title} className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="text-3xl mb-3">{p.icon}</div>
              <div className="font-heading font-bold text-navy text-sm mb-2">{p.title}</div>
              <div className="font-body text-gray-500 text-xs leading-relaxed">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 5 — HOW IT WORKS ─────────────── */
function HowItWorks() {
  const steps = [
    { n: 1, title: 'Deal Review', desc: 'Borrower submits application. We evaluate property, exit strategy, and deal merit.' },
    { n: 2, title: 'Appraisal', desc: 'Independent appraisal confirms value. We verify comps, confirm LTV safety.' },
    { n: 3, title: 'Investor Match', desc: 'We present deal package to matching investors. You review every detail.' },
    { n: 4, title: 'Legal Review', desc: 'Your lawyer reviews mortgage documents. Title search confirms clean title.' },
    { n: 5, title: 'Funding', desc: 'Lawyer registers mortgage on title. Capital advanced to borrower.' },
    { n: 6, title: 'Interest Payments', desc: 'Borrower pays monthly interest directly to you. Principal held in trust.' },
    { n: 7, title: 'Exit', desc: 'Borrower refinances with A/B lender or sells. Full principal returned to you.' },
  ]
  return (
    <section id="how-it-works" className="bg-white py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">The Process</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-12">How Private Lending Works</h2>
        <VideoPlaceholder caption="Deal Structure Walkthrough &middot; 6 mins" className="max-w-3xl mx-auto mb-12" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="text-center">
              <div className="bg-lime text-navy w-8 h-8 rounded-full font-heading font-bold text-sm flex items-center justify-center mx-auto mb-3">{s.n}</div>
              <div className="font-heading font-bold text-navy text-xs mb-1">{s.title}</div>
              <div className="font-body text-gray-500 text-[11px] leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 6 — TYPES OF DEALS ─────────────── */
function TypesOfDeals() {
  const tabs = [
    { id: '1st', label: '1st Mortgage', title: 'First Position Mortgage', desc: 'You are the primary lender. Your charge is registered first on title, giving you absolute priority in the event of default.', ltv: '60\u201375%', rate: '9\u201311%', term: '6\u201312 months', risk: 'Low', riskColor: 'bg-green-100 text-green-700', ex: { prop: '$800,000', loan: '$580,000', ltvPct: '70%', ratePct: '11%', monthly: '$4,667' } },
    { id: '2nd', label: '2nd Mortgage', title: 'Second Position Mortgage', desc: 'Subordinate to the first mortgage. Higher yield compensates for the additional positional risk. Strong equity required.', ltv: '65\u201375%', rate: '12\u201314%', term: '6\u201312 months', risk: 'Moderate', riskColor: 'bg-yellow-100 text-yellow-700', ex: { prop: '$700,000', loan: '$120,000', ltvPct: '74%', ratePct: '13%', monthly: '$1,300' } },
    { id: 'construction', label: 'Construction', title: 'Construction Financing', desc: 'Capital for new builds or major renovations. Draw-based disbursements tied to construction milestones.', ltv: '65% ARV', rate: '10\u201312%', term: '12\u201318 months', risk: 'Moderate', riskColor: 'bg-yellow-100 text-yellow-700', ex: { prop: '$950,000', loan: '$617,500', ltvPct: '65%', ratePct: '11%', monthly: '$5,660' } },
    { id: 'bridge', label: 'Bridge', title: 'Bridge Financing', desc: 'Short-term capital to bridge timing gaps \u2014 between sale and purchase, or between construction and permanent financing.', ltv: '65\u201370%', rate: '10\u201311%', term: '3\u20136 months', risk: 'Low\u2013Moderate', riskColor: 'bg-green-100 text-green-700', ex: { prop: '$600,000', loan: '$400,000', ltvPct: '67%', ratePct: '10.5%', monthly: '$3,500' } },
    { id: 'blended', label: 'Blended', title: 'Blended Structure', desc: 'Combined first and second position or multi-tranche deals. Terms vary based on structure and total exposure.', ltv: 'Varies', rate: '10\u201313%', term: '6\u201324 months', risk: 'Varies', riskColor: 'bg-gray-100 text-gray-700', ex: { prop: '$1,200,000', loan: '$780,000', ltvPct: '65%', ratePct: '11.5%', monthly: '$7,475' } },
  ]
  const [active, setActive] = useState('1st')
  const tab = tabs.find((t) => t.id === active)!
  return (
    <section className="bg-gray-50 py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Investment Options</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-8">Types of Deals</h2>
        <div className="flex gap-1 border-b border-gray-200 mb-8 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActive(t.id)} className={`whitespace-nowrap font-body text-sm px-4 py-3 transition-colors ${active === t.id ? 'border-b-2 border-lime text-navy font-semibold' : 'text-gray-500 hover:text-navy'}`}>{t.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 className="font-heading font-bold text-xl text-navy mb-3">{tab.title}</h3>
            <p className="font-body text-gray-600 mb-6">{tab.desc}</p>
            <div className="space-y-3">
              {[['Typical LTV', tab.ltv], ['Interest Rate', tab.rate], ['Term', tab.term]].map(([l, v]) => (
                <div key={l} className="flex justify-between font-body text-sm border-b border-gray-100 pb-2"><span className="text-gray-500">{l}</span><span className="text-navy font-medium">{v}</span></div>
              ))}
              <div className="flex justify-between font-body text-sm"><span className="text-gray-500">Risk Level</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tab.riskColor}`}>{tab.risk}</span></div>
            </div>
          </div>
          <div className="bg-navy text-white rounded-xl p-6">
            <p className="text-lime text-xs uppercase tracking-wider mb-4">Example Structure</p>
            {[['Property Value', tab.ex.prop], ['Loan Amount', tab.ex.loan], ['LTV', tab.ex.ltvPct], ['Rate', tab.ex.ratePct], ['Monthly Interest', tab.ex.monthly]].map(([l, v]) => (
              <div key={l} className="flex justify-between font-body text-sm border-b border-white/10 py-2.5"><span className="text-gray-400">{l}</span><span className={l === 'LTV' ? 'text-lime font-bold' : 'text-white font-medium'}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 7 — RETURNS & STRUCTURE ─────────────── */
function ReturnsStructure() {
  const returns = [
    { range: '9\u201311%', pos: 'First Position', desc: 'Fixed-rate secured returns on residential and commercial first mortgages. Consistent interest on committed capital.' },
    { range: '12\u201314%', pos: 'Second Position', desc: 'Subordinate security. Higher yield compensates for position. Strong equity requirement required.' },
    { range: '10\u201312%', pos: 'Construction', desc: 'Fixed monthly interest during project duration. Disbursed on completion or refinance.' },
  ]
  const payments = [
    { title: 'Monthly Interest', desc: 'Receive interest payments on the 1st of each month. Predictable, passive income.' },
    { title: 'Quarterly Payments', desc: 'Interest paid in quarterly installments. Common on commercial deals.' },
    { title: 'Accrued Interest', desc: 'Interest compounds. Principal plus all interest paid at maturity. Higher total return.' },
  ]
  return (
    <section className="bg-navy text-white py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Investment Returns</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-white mb-12">Returns &amp; Structure</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {returns.map((r) => (
            <div key={r.pos} className="text-center">
              <div className="font-heading text-5xl text-lime mb-2">{r.range}</div>
              <div className="text-white font-heading font-semibold mb-2">{r.pos}</div>
              <p className="text-gray-400 text-sm font-body">{r.desc}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 pt-12">
          <h3 className="font-heading font-bold text-xl text-white mb-8">Payment Structure Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {payments.map((p) => (
              <div key={p.title} className="flex gap-3">
                <div className="w-3 h-3 rounded-full bg-lime shrink-0 mt-1" />
                <div><div className="font-heading font-semibold text-white text-sm mb-1">{p.title}</div><p className="font-body text-gray-400 text-sm">{p.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 8 — RISK & PROTECTION ─────────────── */
function RiskProtection() {
  const layers = [
    { title: 'Conservative Loan-to-Value Ratios', desc: 'We lend 60\u201375% of assessed values on first mortgages. That means 25\u201340% equity cushion protects your capital even if property values decline.' },
    { title: 'Independent Legal Review', desc: 'Every deal is reviewed by a licensed Ontario real estate lawyer. Title search, lien check, mortgage registration \u2014 all handled by legal counsel, not us.' },
    { title: 'Independent Appraisals', desc: 'We don\u2019t set values. Every deal includes a third-party appraisal by an accredited Ontario appraiser. You see the full report before funding.' },
    { title: 'Power of Sale Rights', desc: 'If a borrower defaults, you have legal authority to initiate power of sale proceedings. Your mortgage is a registered charge \u2014 enforceable under Ontario law.' },
    { title: 'Deal-by-Deal Underwriting', desc: 'No pooled returns. No blind pools. You review every deal individually. You decide which mortgages to fund. Full transparency on every property, borrower, and exit strategy.' },
  ]
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Investor Protection</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-10">Risk &amp; Protection Layers</h2>
        <div className="space-y-4">
          {layers.map((l) => (
            <div key={l.title} className="bg-gray-50 rounded-xl p-5 border-l-4 border-lime">
              <div className="font-heading font-bold text-navy text-sm mb-1">{l.title}</div>
              <p className="font-body text-gray-600 text-sm">{l.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 9 — LEGAL SECURITY ─────────────── */
function LegalSecurity() {
  const items = [
    { icon: '🛡️', title: 'Registered Charge', desc: 'Your mortgage is registered on title in Ontario\u2019s electronic land registration system. Publicly recorded. Legally enforceable.' },
    { icon: '📄', title: 'Title Insurance', desc: 'Protects against defects, fraud, survey issues, and undisclosed liens. Policy remains in effect for life of mortgage.' },
    { icon: '📋', title: 'Position Priority', desc: 'First mortgages have priority over all other charges except property taxes. You get paid first in any sale or refinance scenario.' },
    { icon: '⚖️', title: 'Power of Sale', desc: 'If borrower defaults, you can force sale of property without going through foreclosure in court. Faster recovery of capital.' },
  ]
  return (
    <section className="bg-gray-50 py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Legal Framework</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-10">Your Legal Security Position</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((i) => (
            <div key={i.title} className="text-center bg-white rounded-xl p-6 border border-gray-200">
              <div className="text-3xl mb-3">{i.icon}</div>
              <div className="font-heading font-bold text-navy text-sm mb-2">{i.title}</div>
              <p className="font-body text-gray-500 text-xs leading-relaxed">{i.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 10 — DEAL BREAKDOWN ─────────────── */
function DealBreakdown() {
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Real Example</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-12">Actual Deal Breakdown</h2>
        <VideoPlaceholder caption="Deal Structure Case Study" className="max-w-3xl mx-auto mb-12" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Property Card */}
          <div className="bg-navy text-white rounded-xl p-6">
            <p className="text-lime text-xs uppercase tracking-wider mb-4">The Property</p>
            <div className="font-body text-sm text-gray-300 space-y-1 mb-4">
              <div>Address: 142 Wellington St, Kitchener</div>
              <div>Property Type: Single-Family Residential</div>
            </div>
            <div className="font-heading text-2xl text-lime mb-3">$725,000</div>
            <p className="font-body text-xs text-gray-400">Appraised Value</p>
            <p className="font-body text-gray-300 text-sm mt-4">Borrower Profile: Self-employed contractor. Strong income, recent credit event. Clear exit via bank refinance in 12 months.</p>
          </div>
          {/* Structure Card */}
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <p className="text-navy text-xs uppercase tracking-wider mb-4 font-heading font-bold">The Structure</p>
            {[
              ['Mortgage Amount', '$500,000', false],
              ['LTV', '69%', true],
              ['Interest Rate', '10.5%', false],
              ['Term', '12 months', false],
              ['Monthly Interest', '$4,375', false],
              ['Total Annual Return', '$52,500', true],
            ].map(([l, v, hl]) => (
              <div key={l as string} className="flex justify-between font-body text-sm border-b border-gray-200 py-2">
                <span className="text-gray-500">{l}</span>
                <span className={hl ? 'text-lime font-bold text-xl font-heading' : 'text-navy font-medium'}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <div className="font-heading font-bold text-navy text-sm mb-3">Security Position</div>
            {['First Position Mortgage \u2014 No other registered charges', 'Title Insurance through Stewart Title', 'Independent Appraisal \u2014 Verified comps', 'Legal Review by Miller Thomson LLP'].map((t) => (
              <div key={t} className="flex gap-2 mb-2 font-body text-sm text-gray-600"><span className="text-lime">&#10003;</span>{t}</div>
            ))}
          </div>
          <div>
            <div className="font-heading font-bold text-navy text-sm mb-3">Exit Strategy</div>
            <div className="font-body text-sm text-gray-600 space-y-2">
              <p><span className="font-semibold text-navy">Primary Exit:</span> Borrower refinances with A-lender at 12 month mark. Credit rehab complete.</p>
              <p><span className="font-semibold text-navy">Secondary Exit:</span> Strong market demand in Kitchener. Property listed at $725K if needed.</p>
              <p><span className="font-semibold text-navy">Renewal:</span> If borrower needs more time, mortgage can renew for additional 6&ndash;12 months at investor discretion.</p>
            </div>
          </div>
        </div>
        <div className="bg-navy text-white rounded-xl p-5 text-center">
          <p><span className="text-lime font-heading font-semibold">Outcome:</span> <span className="text-gray-300 text-sm font-body">Borrower refinanced with TD Bank at month 11. Investor received $500,000 principal + $48,125 interest. Total hold period: 11 months. Annualized return: 10.5%</span></p>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 11 — WHO THIS IS FOR ─────────────── */
function WhoThisIsFor() {
  return (
    <section className="bg-gray-50 py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Investor Profile</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-10">Who This Is For</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="font-heading font-bold text-navy mb-4">&#10003; Ideal Investor Profile</div>
            {['You have $100K+ in liquid capital to deploy', 'You want predictable, asset-secured returns', 'You understand real estate fundamentals', 'You can commit capital for 6\u201324 months', 'You prefer secured investments over stock market volatility', 'You want control over which deals you fund', 'You\u2019re comfortable reviewing appraisals and legal documents'].map((t) => (
              <div key={t} className="flex gap-2 mb-2 font-body text-sm text-gray-600"><span className="text-lime">&#10003;</span>{t}</div>
            ))}
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="font-heading font-bold text-navy mb-4">&#10007; Not a Good Fit If</div>
            {['You need immediate liquidity or daily access to capital', 'You want guaranteed returns with zero risk', 'You\u2019re uncomfortable with legal or property concepts', 'You need monthly income to cover living expenses', 'You expect stock market-level liquidity', 'You want diversification across 50+ properties'].map((t) => (
              <div key={t} className="flex gap-2 mb-2 font-body text-sm text-gray-600"><span className="text-red-500">&#10007;</span>{t}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 12 — HOW TO GET STARTED ─────────────── */
function HowToGetStarted() {
  const steps = [
    { n: 1, title: 'Book a Call', desc: '30-minute conversation to discuss your goals, risk tolerance, and capital availability.' },
    { n: 2, title: 'Review Sample Deals', desc: 'We send you 2\u20133 recent deal packages. You see exactly what we underwrite and how deals are structured.' },
    { n: 3, title: 'Investor Onboarding', desc: 'Complete investor profile, KYC documentation, and legal agreements. One-time setup.' },
    { n: 4, title: 'Fund Your First Deal', desc: 'We present live opportunities. You choose which deals to fund. Capital deployed within 7\u201310 days.' },
  ]
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Next Steps</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-12">How to Get Started</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {steps.map((s) => (
            <div key={s.n} className="text-center">
              <div className="bg-lime text-navy w-10 h-10 rounded-full font-heading font-bold text-sm flex items-center justify-center mx-auto mb-3">{s.n}</div>
              <div className="font-heading font-bold text-navy text-sm mb-2">{s.title}</div>
              <p className="font-body text-gray-500 text-xs leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link href="#investor-form" className="bg-lime text-navy px-8 py-4 rounded-lg font-heading font-bold text-lg hover:bg-lime-dark transition-colors inline-block">Schedule Your Investor Call</Link>
          <p className="font-body text-gray-500 text-sm mt-4">No obligation. No pressure. Just a conversation about whether this fits your portfolio.</p>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 13 — FAQ ─────────────── */
function FAQ() {
  const faqs = [
    { q: 'What\u2019s the minimum investment amount?', a: 'Most deals require a minimum of $50,000\u2013$100,000. Some larger commercial mortgages have higher minimums. We work with your capital level to find appropriately sized deals.' },
    { q: 'How quickly can I access my capital if needed?', a: 'Private mortgages are illiquid investments. Your capital is committed for the term \u2014 typically 6\u201312 months. There is no early redemption. Only invest capital you won\u2019t need access to during the term.' },
    { q: 'What happens if the borrower defaults?', a: 'You have the legal right to initiate power of sale proceedings as the registered mortgage holder. We coordinate with legal counsel and assist throughout the process. The 60\u201375% LTV underwriting ensures equity exists to recover principal in most default scenarios.' },
    { q: 'Do you charge fees to investors?', a: 'No. We earn broker fees from borrowers, not investors. You receive 100% of the agreed interest rate. All fees are paid by the borrower at funding and are fully disclosed in the commitment letter.' },
    { q: 'Are returns guaranteed?', a: 'No investment is guaranteed. Private mortgages carry real risk, including borrower default and property value decline. However, the registered mortgage position and conservative LTV underwriting provide meaningful downside protection compared to unsecured lending.' },
    { q: 'Can I use RRSP or TFSA funds?', a: 'Yes. You can invest through a self-directed RRSP, RRIF, or TFSA account via an approved trustee. This allows your interest income to compound tax-deferred or tax-free. Consult your financial advisor to confirm eligibility for your account type.' },
  ]
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="bg-gray-50 py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <p className="font-body text-lime text-xs uppercase tracking-widest mb-2">Common Questions</p>
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-10">Frequently Asked Questions</h2>
        <div>
          {faqs.map((f, i) => (
            <div key={i} className="border-b border-gray-200">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between py-5 text-left">
                <span className="font-heading font-bold text-navy text-sm pr-4">{f.q}</span>
                <span className={`text-navy transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}>&#9660;</span>
              </button>
              {open === i && <p className="font-body text-gray-600 text-sm pb-5 leading-relaxed">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────── SECTION 14 — INVESTOR FORM ─────────────── */
function InvestorForm() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/investor-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: fd.get('firstName'),
          lastName: fd.get('lastName'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          capital: fd.get('capital'),
          position: fd.get('position'),
          vehicle: fd.get('vehicle'),
          message: fd.get('message'),
        }),
      })
      if (res.ok) setSubmitted(true)
    } catch { /* ignore */ } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <section id="investor-form" className="bg-navy text-white py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-lime text-5xl mb-4">&#10003;</div>
          <h2 className="font-heading font-bold text-2xl mb-3">Thank You</h2>
          <p className="font-body text-gray-300">We&apos;ll be in touch within one business day to schedule your investor call.</p>
        </div>
      </section>
    )
  }

  const inputCls = "bg-white text-navy rounded-lg px-4 py-3 w-full focus:ring-2 focus:ring-lime outline-none font-body text-sm"
  const selectCls = `${inputCls} appearance-none`

  return (
    <section id="investor-form" className="bg-navy text-white py-20 px-4">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-heading font-bold text-3xl text-white text-center mb-3">Ready to Explore Private Lending?</h2>
        <p className="font-body text-gray-300 text-center mb-10">Book a 30-minute call with Michael Fox. No sales pitch. Just an honest conversation about whether private mortgage investing fits your portfolio.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input name="firstName" required placeholder="First Name" className={inputCls} />
            <input name="lastName" required placeholder="Last Name" className={inputCls} />
          </div>
          <input name="email" type="email" required placeholder="Email Address" className={inputCls} />
          <input name="phone" type="tel" placeholder="Phone Number" className={inputCls} />
          <select name="capital" className={selectCls}>
            <option value="">Approximate Capital to Invest</option>
            <option>Under $100,000</option>
            <option>$100,000 &ndash; $250,000</option>
            <option>$250,000 &ndash; $500,000</option>
            <option>$500,000 &ndash; $1,000,000</option>
            <option>Over $1,000,000</option>
          </select>
          <select name="position" className={selectCls}>
            <option value="">Preferred Mortgage Position</option>
            <option>1st Mortgage (Lower yield, highest security)</option>
            <option>2nd Mortgage (Higher yield, subordinate position)</option>
            <option>Open to both &mdash; explain my options</option>
          </select>
          <select name="vehicle" className={selectCls}>
            <option value="">Investment Vehicle</option>
            <option>Personal (in my own name)</option>
            <option>Corporation</option>
            <option>RRSP or RRIF</option>
            <option>TFSA</option>
            <option>Not sure &mdash; I&apos;d like guidance</option>
          </select>
          <textarea name="message" rows={4} placeholder="Anything else we should know?" className={inputCls} />
          <button type="submit" disabled={submitting} className="w-full bg-lime text-navy font-heading font-bold text-lg py-4 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-60">
            {submitting ? 'Sending...' : 'Schedule Your Investor Call \u2192'}
          </button>
        </form>
        <p className="font-body text-gray-400 text-sm text-center mt-4">Your information is kept strictly confidential. We will contact you within one business day.</p>
      </div>
    </section>
  )
}

/* ─────────────── SHARED — VIDEO PLACEHOLDER ─────────────── */
function VideoPlaceholder({ caption, className = '' }: { caption: string; className?: string }) {
  return (
    <div className={`bg-black/30 rounded-xl border border-white/10 aspect-video flex flex-col items-center justify-center ${className}`}>
      <div className="w-16 h-16 rounded-full bg-lime flex items-center justify-center mb-3">
        <div className="w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-12 border-l-navy ml-1" style={{ borderLeftWidth: '14px' }} />
      </div>
      <p className="text-gray-400 text-xs font-body" dangerouslySetInnerHTML={{ __html: caption }} />
    </div>
  )
}
