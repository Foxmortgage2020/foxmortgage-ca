import type { Metadata } from 'next'
import Link from 'next/link'
import PenaltyCalculator from '@/app/penalty/PenaltyCalculator'

export const metadata: Metadata = {
  title: 'Prepayment Penalty | Fox Mortgage',
  description:
    'Estimate the cost to break your mortgage early, the greater of three months interest or the interest rate differential.',
}

export default function PrepaymentPenaltyPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <div className="mb-6">
          <nav className="font-body text-xs text-gray-500">
            <Link href="/" className="hover:text-[#032133]">Dashboard</Link>
            <span className="px-1">/</span>
            <Link href="/tools" className="hover:text-[#032133]">Tools</Link>
            <span className="px-1">/</span>
            <span className="text-gray-700">Prepayment Penalty</span>
          </nav>
          <h1 className="font-heading text-2xl sm:text-3xl text-[#032133] leading-tight mt-1">Prepayment Penalty</h1>
        </div>
        <PenaltyCalculator />
      </div>
    </main>
  )
}
