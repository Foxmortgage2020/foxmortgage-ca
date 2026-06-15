import type { Metadata } from 'next'
import RenewalCompare from './RenewalCompare'

export const metadata: Metadata = {
  title: 'Renewal Compare | Fox Mortgage',
  description:
    'Project your balance to maturity and compare renewal options side by side. Built by Mike Fox, Mortgage Agent, Level 2.',
}

export default function RenewalComparePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <RenewalCompare />
      </div>
    </main>
  )
}
