import PenaltyCalculator from './PenaltyCalculator'

export default function PenaltyPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-xl mx-auto lg:grid lg:grid-cols-[minmax(420px,0.7fr)_minmax(640px,1fr)] lg:h-[calc(100dvh)]">
        {/* Left brand panel */}
        <aside className="lg:overflow-hidden order-2 lg:order-1 px-2 py-6 lg:py-12">
          <div className="relative h-full min-h-[220px] overflow-hidden rounded-2xl bg-[#032133]">
            <div className="relative z-10 h-full flex flex-col px-8 pt-8 pb-6">
              <div className="mb-10">
                <span className="font-heading text-3xl text-white tracking-tight">
                  Fox Mortgage
                </span>
              </div>
              <div className="space-y-4 max-w-sm">
                <h1 className="font-heading text-white text-2xl leading-tight">
                  Know the cost before you break.
                </h1>
                <p className="font-body text-white/85 text-sm leading-relaxed">
                  Estimate the prepayment penalty on a fixed-rate mortgage in seconds. Use the Bank of Canada lookup for posted rates, then refine with the original commitment letter for a precise figure.
                </p>
              </div>
              <div className="mt-auto pt-8">
                <p className="font-body text-white/50 text-xs leading-relaxed">
                  Mike Fox, Mortgage Agent Level 2 — BRX Mortgage FSRA #13463
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right calculator panel */}
        <section className="flex flex-col lg:overflow-y-auto order-1 lg:order-2 px-4 sm:px-10 py-6 lg:py-12">
          <PenaltyCalculator />
        </section>
      </div>
    </main>
  )
}
