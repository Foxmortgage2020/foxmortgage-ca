import Nav from '@/components/nav'
import Footer from '@/components/footer'
import Link from 'next/link'
import SMMDashboardCard from '@/components/smm-dashboard-card'

export default function SMMPage() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        {/* Hero */}
        <section className="py-20 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center bg-lime/10 border border-lime/20 rounded-full px-4 py-1.5 mb-6">
                  <span className="w-2 h-2 rounded-full bg-lime mr-2 animate-pulse"></span>
                  <span className="font-body text-xs font-medium text-lime">Monitoring Active</span>
                </div>
                <h1 className="font-heading font-bold text-4xl md:text-5xl mb-6 leading-tight">
                  Strategic Mortgage<br /><span className="text-lime">Monitoring</span>
                </h1>
                <p className="font-body text-gray-300 text-lg leading-relaxed mb-8">
                  Most homeowners find out about savings opportunities after they&apos;ve passed. Strategic Mortgage Monitoring means someone is always watching — so you&apos;re always positioned to act.
                </p>
                <div className="flex flex-wrap gap-6 mb-8">
                  {['Daily rate tracking', 'Renewal alerts', 'Savings reports', 'Annual review'].map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <span className="text-lime">✓</span>
                      <span className="font-body text-sm text-gray-300">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center">
                <SMMDashboardCard />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="font-heading font-bold text-3xl text-navy mb-4">How it works</h2>
              <p className="font-body text-gray-500">Simple to start. Powerful over time.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { num: '01', title: 'Enroll in 5 minutes', body: 'Tell us your current rate, lender, renewal date, and mortgage balance. That\'s all we need to start.' },
                { num: '02', title: 'We monitor daily', body: 'Every day we check rate movements, market conditions, and your specific renewal window against current opportunities.' },
                { num: '03', title: 'You act when it matters', body: 'We reach out when there\'s a genuine opportunity. No noise, no sales pressure — just timely intelligence.' },
              ].map((s) => (
                <div key={s.num} className="text-center">
                  <div className="w-14 h-14 rounded-full bg-lime flex items-center justify-center mx-auto mb-5">
                    <span className="font-heading font-bold text-navy">{s.num}</span>
                  </div>
                  <h3 className="font-heading font-bold text-navy text-lg mb-3">{s.title}</h3>
                  <p className="font-body text-gray-500 text-sm leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Enroll CTA */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-heading font-bold text-3xl text-navy mb-4">
              Start monitoring your mortgage
            </h2>
            <p className="font-body text-gray-500 mb-10">
              Takes 5 minutes. Michael will be in touch to confirm your details.
            </p>
            <Link
              href="/smm/enroll"
              className="inline-block bg-lime text-navy font-heading font-bold px-10 py-4 rounded-xl hover:bg-lime-dark transition-colors"
            >
              Start Monitoring →
            </Link>
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
