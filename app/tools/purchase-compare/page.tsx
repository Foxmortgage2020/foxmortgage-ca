import type { Metadata } from 'next'
import PurchaseCompare from './PurchaseCompare'

export const metadata: Metadata = {
  title: 'Purchase Compare | Fox Mortgage',
  description:
    'Compare two to four purchase options side by side on payment, interest, debt service, and cash to close. Built by Mike Fox, Mortgage Agent, Level 2.',
}

export default function PurchaseComparePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <PurchaseCompare />
      </div>
    </main>
  )
}
