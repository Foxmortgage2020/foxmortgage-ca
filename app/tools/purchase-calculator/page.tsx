import type { Metadata } from 'next'
import PurchaseCalculator from './PurchaseCalculator'

export const metadata: Metadata = {
  title: 'Purchase Calculator | Fox Mortgage',
  description:
    'A full home purchase run: down payment, CMHC insurance, land transfer tax, and closing costs in one report. Built by Mike Fox, Mortgage Agent, Level 2.',
}

export default function PurchaseCalculatorPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <PurchaseCalculator />
      </div>
    </main>
  )
}
