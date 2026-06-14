import type { Metadata } from 'next'
import RefinanceAnalyzer from './RefinanceAnalyzer'

export const metadata: Metadata = {
  title: 'Refinance Analyzer | Fox Mortgage',
  description:
    'See what refinancing your mortgage could save. Compare your payment, break-even point, and interest over the term with Mike Fox, Mortgage Agent, Level 2.',
}

export default function RefinancePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-lg mx-auto px-4 sm:px-8 py-6 lg:py-12">
        {/* Brand header */}
        <header className="rounded-2xl bg-[#032133] px-6 sm:px-8 py-7 mb-6 print:bg-white print:px-0 print:py-0 print:mb-4">
          <span className="font-heading text-2xl text-white tracking-tight print:text-[#032133]">
            Fox Mortgage
          </span>
          <h1 className="font-heading text-white text-2xl sm:text-3xl leading-tight mt-4 max-w-xl print:hidden">
            Should you refinance? Let&rsquo;s find out.
          </h1>
          <p className="font-body text-white/85 text-sm leading-relaxed mt-3 max-w-xl print:hidden">
            Put in your current mortgage and the new rate you&rsquo;re looking at. We&rsquo;ll find your
            real savings, your break-even point, and how much sooner you could be mortgage free.
          </p>
          <p className="font-body text-white/50 text-xs leading-relaxed mt-5 print:text-gray-500">
            Mike Fox, Mortgage Agent, Level 2 — BRX Mortgage FSRA #13463
          </p>
        </header>

        <RefinanceAnalyzer />
      </div>
    </main>
  )
}
