// ─── Demo FP portal layout ─────────────────────────────────────────────────────
// Standalone, sandboxed chrome for the public /demo/fp pitch portal. Deliberately
// does NOT use Clerk, useUser, PartnerPicker, or any portal/auth wiring — the
// real PortalShell/PortalLayoutClient are off-limits here. Simple brand frame +
// nav between demo views + a persistent "sample data" banner.
//
// noindex (belt-and-suspenders alongside the X-Robots-Tag header in next.config.js).

import type { Metadata } from 'next'
import DemoFPNav from './_components/DemoFPNav'
import { DEMO_BANNER_TEXT } from './_data/demo-data'

export const metadata: Metadata = {
  title: 'Fox Mortgage | Financial Planner Portal (Demo)',
  robots: { index: false, follow: false },
}

export default function DemoFPLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sample-data banner — always visible so the planner knows this is a preview */}
      <div className="bg-amber-50 border-b border-amber-300 px-4 md:px-8 py-2 text-center">
        <p className="font-body text-xs md:text-sm text-amber-900">
          <span className="font-semibold">Demo.</span> {DEMO_BANNER_TEXT}
        </p>
      </div>

      {/* Brand header + nav */}
      <header className="sticky top-0 z-30 bg-navy text-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <span className="font-heading font-bold text-xl">
              Fox <span className="text-lime">Mortgage</span>
            </span>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Strategic Mortgage Monitoring · Financial Planner Portal
            </p>
          </div>
          <span className="hidden md:inline-block font-body text-[10px] font-semibold uppercase tracking-wider bg-lime/20 text-lime px-3 py-1 rounded-full">
            Sample / Demo
          </span>
        </div>
        <DemoFPNav />
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 text-center">
          <p className="font-body text-xs text-gray-400">
            This is a sample portal populated with fictional data for demonstration only. Michael
            Fox, Mortgage Agent, Level 2 · BRX Mortgage · FSRA #13463.
          </p>
        </div>
      </footer>
    </div>
  )
}
