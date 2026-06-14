import type { Metadata } from 'next'
import AffordabilityCalculator from '@/components/affordability/AffordabilityCalculator'

export const metadata: Metadata = {
  title: 'Debt Service Calculator | Fox Mortgage',
  description:
    'See your GDS and TDS ratios against the stress test for a given mortgage and income. Built by Mike Fox, Mortgage Agent, Level 2.',
}

export default function DebtServicePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <AffordabilityCalculator mode="debt-service" />
      </div>
    </main>
  )
}
