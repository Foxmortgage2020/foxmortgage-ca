import Nav from '@/components/nav'
import Footer from '@/components/footer'
import Link from 'next/link'

export default function About() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        {/* Hero */}
        <section className="py-20 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="font-body text-lime text-sm font-medium uppercase tracking-wider mb-4">About</p>
              <h1 className="font-heading font-bold text-4xl md:text-5xl mb-6">
                Michael Fox,<br />Mortgage Agent, Level 2
              </h1>
              <p className="font-body text-gray-300 text-lg leading-relaxed">
                Based in Fergus, Ontario. Brokered by BRX Mortgage. Serving homeowners, realtors, and investors across Wellington County, Guelph, and province-wide.
              </p>
            </div>
          </div>
        </section>

        {/* Bio */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
              <div className="w-full h-96 bg-gradient-to-br from-navy to-navy-light rounded-2xl flex items-center justify-center">
                <div className="text-center text-white/30">
                  <div className="text-6xl mb-2">👤</div>
                  <p className="font-body text-sm">Photo coming soon</p>
                </div>
              </div>
              <div>
                <h2 className="font-heading font-bold text-2xl text-navy mb-6">
                  A strategist, not just a transaction.
                </h2>
                <div className="space-y-4 font-body text-gray-600 leading-relaxed">
                  <p>
                    Most people interact with a mortgage agent exactly twice: when they buy, and when they renew. I built Fox Mortgage to change that relationship entirely.
                  </p>
                  <p>
                    Through my Strategic Mortgage Monitoring program, I stay actively engaged with every client's mortgage — tracking market rates, watching renewal windows, and identifying refinance opportunities before they pass.
                  </p>
                  <p>
                    I'm licensed as a Mortgage Agent, Level 2 and brokered through BRX Mortgage, giving me access to 50+ lenders across Canada. That means more options, better rates, and solutions for situations the banks won't touch.
                  </p>
                </div>
                <div className="mt-8 p-6 bg-gray-50 rounded-xl border border-gray-100">
                  <h3 className="font-heading font-bold text-navy text-sm uppercase tracking-wider mb-4">Credentials</h3>
                  <ul className="space-y-2 font-body text-sm text-gray-600">
                    <li>✓ Mortgage Agent, Level 2 — Province of Ontario</li>
                    <li>✓ BRX Mortgage Inc. — FSRA #13463</li>
                    <li>✓ 50+ lender relationships</li>
                    <li>✓ Fergus · Guelph · Wellington County · Province-wide</li>
                  </ul>
                </div>
                <div className="flex gap-4 mt-8">
                  <Link href="/contact" className="bg-lime text-navy font-heading font-bold px-6 py-3 rounded-xl hover:bg-lime-dark transition-colors">
                    Book a Call
                  </Link>
                  <Link href="/smm" className="border-2 border-navy text-navy font-heading font-bold px-6 py-3 rounded-xl hover:bg-navy hover:text-white transition-colors">
                    Learn About Monitoring
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
