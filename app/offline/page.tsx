import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Offline — Fox Mortgage',
}

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-navy text-white flex items-center justify-center px-6 py-16 font-body">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <span className="font-heading text-2xl font-bold tracking-tight">
            Fox<span className="text-lime"> Mortgage</span>
          </span>
        </div>

        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-lime/40 bg-navy-light">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#95D600"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8"
            aria-hidden="true"
          >
            <path d="M1 1l22 22" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 className="font-heading text-3xl font-bold">You&rsquo;re offline</h1>
        <p className="mt-3 text-white/70">
          The command center needs a connection to load live pipeline, approvals,
          and rate data. Reconnect and try again.
        </p>

        <a
          href="/portal/admin"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-lime px-6 py-3 font-heading font-semibold text-navy transition-colors hover:bg-lime-dark"
        >
          Retry
        </a>
      </div>
    </main>
  )
}
