import type { Metadata } from 'next'
import MortgageCalculator from './MortgageCalculator'

export const metadata: Metadata = {
  title: 'Mortgage Calculator | Fox Mortgage',
  description:
    'Payment, amortization, and prepayment analysis for any Canadian mortgage. Built by Mike Fox, Mortgage Agent, Level 2.',
}

export default function MortgageCalculatorPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <MortgageCalculator />
      </div>
    </main>
  )
}
