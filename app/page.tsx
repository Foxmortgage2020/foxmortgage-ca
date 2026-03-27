import Nav from '@/components/nav'
import Footer from '@/components/footer'
import SMMDashboardCard from '@/components/smm-dashboard-card'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen">
      <Nav />

      {/* ── HERO ── */}
      <section className="pt-24 pb-16 md:pt-32 md:pb-24 bg-gradient-to-br from-white via-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center bg-lime/10 border border-lime/20 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 rounded-full bg-lime mr-2"></span>
                <span className="font-body text-xs font-medium text-navy">Mortgage Agent, Level 2 · Ontario</span>
              </div>
              <h1 className="font-heading font-bold text-4xl md:text-5xl lg:text-6xl text-navy leading-tight mb-6">
                Your Mortgage,{' '}
                <span className="text-lime">Monitored.</span>{' '}
                Every Day.
              </h1>
              <p className="font-body text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">
                Most homeowners set their mortgage and forget it. I build a system that watches it for you — so you never miss a savings opportunity.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/smm"
                  className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-all hover:shadow-lg text-center"
                >
                  Start Monitoring
                </Link>
                <Link
                  href="/contact"
                  className="border-2 border-navy text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-navy hover:text-white transition-all text-center"
                >
                  Book a Call
                </Link>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <SMMDashboardCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <section className="bg-navy py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {[
              'BRX Mortgage',
              'FSRA #13463',
              'Fergus · Guelph · Wellington County',
              '200+ Clients Monitored',
              '⭐ 5.0 Google Rating',
            ].map((item) => (
              <span key={item} className="font-body text-sm text-white/70 font-medium whitespace-nowrap">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE PROBLEM ── */}
      <section className="bg-navy py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-white mb-4">
              Most mortgages are set and forgotten.
            </h2>
            <p className="font-body text-gray-400 text-lg max-w-2xl mx-auto">
              Your bank isn't watching out for you. Here's what that costs.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '📉',
                title: "Banks don't call when rates drop",
                body: 'Your renewal could cost thousands more than necessary. Rate opportunities pass silently.',
              },
              {
                icon: '📅',
                title: 'Renewal dates sneak up',
                body: '3 months notice isn\'t enough time to properly shop your mortgage and negotiate the best terms.',
              },
              {
                icon: '💸',
                title: "You're leaving money on the table",
                body: 'Without ongoing analysis, you never know what you\'re missing. Most homeowners overpay at renewal.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:border-lime/30 transition-colors">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="font-heading font-bold text-white text-lg mb-3">{item.title}</h3>
                <p className="font-body text-gray-400 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THE SYSTEM (SMM) ── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center bg-lime/10 rounded-full px-4 py-1.5 mb-6">
                <span className="font-body text-xs font-bold text-navy uppercase tracking-wider">The System</span>
              </div>
              <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-4">
                Strategic Mortgage Monitoring
              </h2>
              <p className="font-body text-gray-600 text-lg mb-10 leading-relaxed">
                A proactive system that watches your mortgage so you don't have to.
              </p>
              <div className="space-y-8">
                {[
                  {
                    num: '01',
                    title: 'You enroll',
                    body: 'Takes 5 minutes. We capture your mortgage details — rate, term, renewal date, lender.',
                  },
                  {
                    num: '02',
                    title: 'We monitor daily',
                    body: 'Rate changes, market shifts, renewal windows, refinance opportunities — all tracked automatically.',
                  },
                  {
                    num: '03',
                    title: 'You hear from us when it matters',
                    body: 'No noise, no spam. Only actionable insights that could save you real money.',
                  },
                ].map((step) => (
                  <div key={step.num} className="flex gap-5">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-lime flex items-center justify-center">
                      <span className="font-heading font-bold text-navy text-xs">{step.num}</span>
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-navy text-lg mb-1">{step.title}</h3>
                      <p className="font-body text-gray-500 text-sm leading-relaxed">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                href="/smm"
                className="inline-block mt-10 bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-colors"
              >
                Enroll in Monitoring
              </Link>
            </div>
            <div className="flex justify-center">
              <SMMDashboardCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── WHO IT'S FOR ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-4">
              Built for homeowners. Trusted by partners.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: '🏡',
                title: 'Homeowners',
                body: "You bought a home. I'll make sure your mortgage keeps working for you — from purchase through every renewal.",
                cta: 'Start Monitoring',
                href: '/smm',
              },
              {
                icon: '🤝',
                title: 'Realtor Partners',
                body: 'Refer your clients with confidence. I take care of them long after closing — and keep you informed.',
                cta: 'Partner with Us →',
                href: '/portal/sign-in',
              },
              {
                icon: '📊',
                title: 'Private Investors',
                body: 'Private lending and investment mortgage strategies. Structured deals, clear terms.',
                cta: 'Access Portal →',
                href: '/private-lending',
              },
            ].map((card) => (
              <div key={card.title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:border-lime/30 hover:shadow-md transition-all">
                <div className="text-3xl mb-5">{card.icon}</div>
                <h3 className="font-heading font-bold text-navy text-xl mb-3">{card.title}</h3>
                <p className="font-body text-gray-500 text-sm leading-relaxed mb-6">{card.body}</p>
                <Link
                  href={card.href}
                  className="font-heading font-bold text-sm text-navy border-b-2 border-lime hover:text-lime transition-colors"
                >
                  {card.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY FOX MORTGAGE ── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Photo placeholder */}
            <div className="flex justify-center lg:justify-start">
              <div className="w-80 h-96 bg-gradient-to-br from-navy to-navy-light rounded-2xl flex items-center justify-center overflow-hidden">
                <div className="text-center text-white/30">
                  <div className="text-6xl mb-2">👤</div>
                  <p className="font-body text-sm">Michael Fox photo</p>
                </div>
              </div>
            </div>
            <div>
              <div className="inline-flex items-center bg-lime/10 rounded-full px-4 py-1.5 mb-6">
                <span className="font-body text-xs font-bold text-navy uppercase tracking-wider">Why Fox Mortgage</span>
              </div>
              <h2 className="font-heading font-bold text-3xl md:text-4xl text-navy mb-4">
                A mortgage agent who thinks like a strategist.
              </h2>
              <p className="font-body text-gray-600 leading-relaxed mb-8">
                Michael Fox, Mortgage Agent, Level 2 at BRX Mortgage. Based in Fergus, serving Wellington County, Guelph, and across Ontario. The difference isn't just finding you a rate — it's building a system that protects you long after closing day.
              </p>
              <ul className="space-y-4">
                {[
                  'Access to 50+ lenders through BRX Mortgage',
                  'Ongoing monitoring — not just at renewal',
                  'Direct line, no call centres',
                  'Fully digital process, always available',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-lime flex items-center justify-center mt-0.5">
                      <span className="text-navy text-xs font-bold">✓</span>
                    </div>
                    <span className="font-body text-gray-600 text-sm">{point}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/about"
                className="inline-block mt-8 font-heading font-bold text-navy border-b-2 border-lime hover:text-lime transition-colors"
              >
                Learn more about Michael →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="font-body text-sm text-gray-500 mb-2">⭐⭐⭐⭐⭐ Based on Google Reviews</p>
            <h2 className="font-heading font-bold text-3xl text-navy">What clients say</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Sarah M.',
                location: 'Fergus, ON',
                text: "Michael caught a rate drop 6 months before my renewal and saved me thousands. The monitoring program is exactly what I needed — I didn't even know this kind of service existed.",
              },
              {
                name: 'James & Lisa T.',
                location: 'Guelph, ON',
                text: "First-time buyers and we were completely overwhelmed. Michael walked us through everything and found us a rate we didn't think we'd qualify for. Highly recommend.",
              },
              {
                name: 'David K.',
                location: 'Wellington County, ON',
                text: "Switched from my bank after Michael showed me what I was leaving on the table. The whole process was seamless. Three years later, still getting proactive check-ins.",
              },
            ].map((review) => (
              <div key={review.name} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-lime text-lg">★</span>
                  ))}
                </div>
                <p className="font-body text-gray-600 text-sm leading-relaxed mb-6 italic">"{review.text}"</p>
                <div>
                  <p className="font-heading font-bold text-navy text-sm">{review.name}</p>
                  <p className="font-body text-xs text-gray-400">{review.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRIMARY CTA ── */}
      <section className="py-20 bg-navy">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-white mb-4">
            Ready to have your mortgage monitored?
          </h2>
          <p className="font-body text-gray-300 text-lg mb-10">
            Join homeowners across Ontario who never miss a savings opportunity.
          </p>
          <form
            action="/api/smm-enroll"
            method="POST"
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              name="email"
              required
              placeholder="Your email address"
              className="flex-1 px-5 py-4 rounded-xl font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime"
            />
            <button
              type="submit"
              className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-colors whitespace-nowrap"
            >
              Start Monitoring
            </button>
          </form>
          <p className="font-body text-xs text-gray-500 mt-4">
            No spam. Only actionable alerts when your mortgage situation changes.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
