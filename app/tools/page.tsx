import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Tools | Fox Mortgage',
  description: 'Fox Mortgage calculators and planning tools.',
}

// Add new tools here. One line each and they show up in the grid.
const TOOLS: { title: string; description: string; href: string }[] = [
  {
    title: 'Mortgage Calculator',
    description: 'Payment, amortization, and prepayment analysis for any mortgage.',
    href: '/tools/mortgage-calculator',
  },
  {
    title: 'Purchase Calculator',
    description: 'Full purchase run with down payment, CMHC insurance, land transfer tax, and closing costs in one report.',
    href: '/tools/purchase-calculator',
  },
  {
    title: 'Refinance Analyzer',
    description: 'Compare your current mortgage against a refinance, including penalty and break-even.',
    href: '/refinance',
  },
]

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-lg mx-auto px-4 sm:px-8 py-6 lg:py-12">
        <header className="rounded-2xl bg-[#032133] px-6 sm:px-8 py-7 mb-6">
          <span className="font-heading text-2xl text-white tracking-tight">Fox Mortgage</span>
          <h1 className="font-heading text-white text-2xl sm:text-3xl leading-tight mt-4">Tools</h1>
          <p className="font-body text-white/85 text-sm leading-relaxed mt-3 max-w-xl">
            Fox Mortgage calculators and planning tools.
          </p>
          <p className="font-body text-white/50 text-xs leading-relaxed mt-5">
            Mike Fox, Mortgage Agent, Level 2 at BRX Mortgage FSRA #13463
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-2xl border border-gray-200 bg-white p-6 transition hover:border-[#95D600] hover:shadow-sm"
            >
              <h2 className="font-heading text-lg text-[#032133]">{t.title}</h2>
              <p className="font-body text-sm text-gray-600 mt-1.5 leading-relaxed">{t.description}</p>
              <span className="font-body text-sm font-medium text-[#032133] mt-3 inline-flex items-center gap-1">
                Open
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  &rarr;
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
