// Session 9: shown in demo mode on the management / PII surfaces that are
// NOT part of the demo walkthrough (People, view-as log, Ask Fox history,
// partner detail). Rendered BEFORE any data fetch, so demo mode performs
// zero real reads on these pages and never shows a real person's data.

export default function DemoNotAvailable({ surface }: { surface?: string }) {
  return (
    <div className="max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h1 className="font-heading text-navy text-xl font-bold">
          {surface ?? 'This surface'} isn&apos;t part of the demo
        </h1>
        <p className="text-gray-500 font-body text-sm mt-2">
          Demo mode shows fictional data across the pipeline, deal rooms, approvals, and rates.
          This page works on live people and records, so it stays out of the demo entirely —
          exit demo mode (the banner at the top) to use it.
        </p>
      </div>
    </div>
  )
}
