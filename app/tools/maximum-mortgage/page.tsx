import type { Metadata } from 'next'
import AffordabilityCalculator from '@/components/affordability/AffordabilityCalculator'

export const metadata: Metadata = {
  title: 'Maximum Mortgage Calculator | Fox Mortgage',
  description:
    'Find the largest mortgage your income supports under the stress test. Built by Mike Fox, Mortgage Agent, Level 2.',
}

export default function MaximumMortgagePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <AffordabilityCalculator mode="maximum-mortgage" />
      </div>
    </main>
  )
}
