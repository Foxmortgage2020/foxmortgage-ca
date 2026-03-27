import Nav from '@/components/nav'
import Footer from '@/components/footer'
import Link from 'next/link'

const services = [
  {
    icon: '🏠',
    title: 'Purchase Mortgages',
    subtitle: 'First-time buyers & move-up buyers',
    body: 'Whether it\'s your first home or your fourth, I find the right mortgage structure for your situation — not just the lowest rate.',
    points: ['Pre-qualification in 24 hours', 'Access to 50+ lenders', 'First-time buyer programs', 'Bridge financing available'],
  },
  {
    icon: '🔄',
    title: 'Renewals & Refinancing',
    subtitle: 'Don\'t just renew — optimize',
    body: 'Your renewal is a negotiation, not a formality. I shop your mortgage across the market and structure the right deal before your term expires.',
    points: ['120-day rate holds', 'Full market comparison', 'Cash-out refinancing', 'Debt consolidation'],
  },
  {
    icon: '💼',
    title: 'Self-Employed',
    subtitle: 'Solutions for business owners',
    body: 'Traditional income verification doesn\'t work for everyone. I specialize in stated income and alt-A solutions for self-employed Canadians.',
    points: ['Stated income programs', 'Business-for-self options', 'Multiple income streams', 'Private lender access'],
  },
  {
    icon: '🏗️',
    title: 'Investment Properties',
    subtitle: 'Build your portfolio',
    body: 'From single rental units to multi-family properties, I structure investment mortgages that work with your cash flow strategy.',
    points: ['Rental income qualification', 'Portfolio lending', 'HELOC strategies', 'Commercial referrals'],
  },
  {
    icon: '📊',
    title: 'Private Lending',
    subtitle: 'When banks say no',
    body: 'Access to private mortgage capital for situations that don\'t fit conventional lending — credit challenges, unique properties, and short-term bridges.',
    points: ['Fast approvals', 'Flexible terms', 'Credit rebuild strategies', 'Exit planning included'],
  },
  {
    icon: '📡',
    title: 'Strategic Mortgage Monitoring',
    subtitle: 'Your mortgage, watched daily',
    body: 'An ongoing monitoring program that tracks your mortgage against the market — so you\'re always in the best position.',
    points: ['Daily rate monitoring', 'Renewal alerts', 'Savings opportunities', 'Annual review included'],
    featured: true,
  },
]

export default function Services() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        <section className="py-16 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-body text-lime text-sm uppercase tracking-wider mb-4">Services</p>
              <h1 className="font-heading font-bold text-4xl md:text-5xl mb-4">Mortgage solutions for every situation.</h1>
              <p className="font-body text-gray-300 text-lg">From first purchase to investment portfolio — I find the right structure, not just the right rate.</p>
            </div>
          </div>
        </section>
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {services.map((s) => (
                <div key={s.title} className={`rounded-2xl p-8 border transition-all hover:shadow-md ${s.featured ? 'bg-navy text-white border-navy' : 'bg-white border-gray-100 hover:border-lime/30'}`}>
                  <div className="text-3xl mb-4">{s.icon}</div>
                  <h2 className={`font-heading font-bold text-xl mb-1 ${s.featured ? 'text-white' : 'text-navy'}`}>{s.title}</h2>
                  <p className={`font-body text-xs font-medium mb-4 ${s.featured ? 'text-lime' : 'text-lime-dark'}`}>{s.subtitle}</p>
                  <p className={`font-body text-sm leading-relaxed mb-5 ${s.featured ? 'text-gray-300' : 'text-gray-500'}`}>{s.body}</p>
                  <ul className="space-y-2">
                    {s.points.map((p) => (
                      <li key={p} className={`font-body text-xs flex items-center gap-2 ${s.featured ? 'text-gray-300' : 'text-gray-500'}`}>
                        <span className="text-lime">✓</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="text-center mt-14">
              <Link href="/contact" className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-colors text-lg">
                Talk to Michael
              </Link>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
