// Styled placeholder for command-center sections that arrive in a later
// session. The section name, nav position, and permission key are final;
// only the wiring is pending.

import Link from 'next/link'

export default function StubPage({
  title,
  description,
  session,
  children,
}: {
  title: string
  description: string
  session: number
  children?: React.ReactNode
}) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-heading text-navy text-2xl font-bold">{title}</h1>
        <span className="bg-cool-100 text-cool-700 border border-cool-200 text-xs font-semibold px-3 py-1 rounded-full">
          Arrives in Session {session}
        </span>
      </div>
      <p className="text-cool-600 font-ui mt-3">{description}</p>

      {children}

      <div className="mt-8 bg-white border border-cool-200 rounded-xl p-6">
        <p className="text-sm text-cool-500 font-ui">
          This section is scaffolded and permission-gated today; live wiring lands in Session{' '}
          {session}.
        </p>
        <Link
          href="/portal/admin"
          className="inline-block mt-3 text-sm font-semibold text-navy hover:text-ink"
        >
          Back to Home &rarr;
        </Link>
      </div>
    </div>
  )
}
