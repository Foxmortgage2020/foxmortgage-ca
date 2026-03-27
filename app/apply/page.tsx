import Nav from '@/components/nav'
import Footer from '@/components/footer'
import Link from 'next/link'

export default function Apply() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        <section className="py-20 bg-navy text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-heading font-bold text-4xl md:text-5xl mb-6">Ready to get started?</h1>
            <p className="font-body text-gray-300 text-lg mb-10">
              The fastest way to start is a quick conversation. Tell me about your situation and I'll come back with options.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/contact" className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-colors">
                Book a Free Consultation
              </Link>
              <Link href="/smm" className="border-2 border-white text-white font-heading font-bold px-8 py-4 rounded-xl hover:bg-white hover:text-navy transition-colors">
                Start Monitoring
              </Link>
            </div>
          </div>
        </section>
        <section className="py-20 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-heading font-bold text-2xl text-navy mb-4">What you'll need</h2>
            <p className="font-body text-gray-500 mb-8">For a purchase or refinance, having these ready speeds things up considerably:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              {[
                'Proof of income (T4, NOA, paystubs)',
                'Recent bank statements (90 days)',
                'ID (government issued)',
                'Employment letter (if applicable)',
                'Current mortgage statement (if refinancing)',
                'Property details (if purchase)',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
                  <span className="text-lime mt-0.5">✓</span>
                  <span className="font-body text-sm text-gray-600">{item}</span>
                </div>
              ))}
            </div>
            <p className="font-body text-xs text-gray-400 mt-8">
              Don't have everything? That's fine — we can start the conversation without it.
            </p>
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
