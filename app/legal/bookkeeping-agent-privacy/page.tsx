import Link from 'next/link'

export const metadata = {
  title: 'Fox Bookkeeping Agent — Privacy Disclosure',
  robots: {
    index: false,
    follow: false,
  },
}

export default function BookkeepingAgentPrivacy() {
  return (
    <main className="min-h-screen bg-white">
      {/* Minimal header */}
      <header className="border-b border-gray-100 py-4 px-6">
        <Link href="/" className="font-heading font-bold text-navy text-xl">
          Fox <span className="text-lime">Mortgage</span>
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">

        <div>
          <h1 className="font-heading font-bold text-3xl text-navy mb-2">
            Fox Bookkeeping Agent — Privacy Disclosure
          </h1>
          <p className="font-body text-sm text-gray-500">Effective Date: April 18, 2026</p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">Developer</h2>
          <p className="font-body text-gray-600 leading-relaxed">
            2802551 Ontario Inc., operated by Michael Fox.<br />
            Contact:{' '}
            <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">
              mfox@foxmortgage.ca
            </a>
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">App Purpose</h2>
          <p className="font-body text-gray-600 leading-relaxed">
            The Fox Bookkeeping Agent is a single-tenant, internal-use application that automates bookkeeping
            for 2802551 Ontario Inc. only. It is not a public application and has no end-users other than the
            developer (Michael Fox).
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">QBO Data Accessed</h2>
          <p className="font-body text-gray-600 leading-relaxed mb-3">
            Using the QuickBooks Accounting scope (<code className="text-sm bg-gray-100 px-1 py-0.5 rounded">com.intuit.quickbooks.accounting</code>):
          </p>
          <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
            <li>Transactions (purchases, expenses)</li>
            <li>Accounts and chart of accounts</li>
            <li>Journal entries</li>
            <li>Class lists</li>
          </ul>
          <p className="font-body text-gray-600 leading-relaxed mt-3">
            Both read and write access are used.
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">How Data Is Used</h2>
          <p className="font-body text-gray-600 leading-relaxed mb-3">
            QBO data is used exclusively for:
          </p>
          <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
            <li>Transaction categorization against the company chart of accounts</li>
            <li>Deferred revenue recognition and journal entry creation</li>
            <li>Class attribution for business-line project tracking</li>
            <li>Internal financial reporting</li>
          </ul>
          <p className="font-body text-gray-600 leading-relaxed mt-3">
            All data use is strictly limited to the bookkeeping of 2802551 Ontario Inc.
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">Data Sharing</h2>
          <p className="font-body text-gray-600 leading-relaxed">
            No QuickBooks data is shared with any third party. No data is sold, redistributed, or used outside
            the single-tenant bookkeeping operation described above.
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">Technical Infrastructure</h2>
          <p className="font-body text-gray-600 leading-relaxed">
            Data is processed through Vercel-hosted API routes and n8n automation workflows. No QBO data is
            stored persistently outside of QuickBooks Online itself.
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">Single-Tenant Scope</h2>
          <p className="font-body text-gray-600 leading-relaxed">
            This application is authorized by and operates for a single user (Michael Fox) and a single
            QuickBooks company (2802551 Ontario Inc.). There are no other users or company entities within
            the scope of this application.
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">Revoking Access</h2>
          <p className="font-body text-gray-600 leading-relaxed">
            QBO access can be revoked at any time by the authorizing user through:{' '}
            <strong>Intuit Account &rarr; Apps &rarr; Connected Apps</strong>.
          </p>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">Security</h2>
          <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
            <li>All data in transit is encrypted via HTTPS/TLS</li>
            <li>Portal routes are protected by Clerk authentication</li>
            <li>Webhook endpoints are secured with environment-variable-stored secrets</li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading font-bold text-lg text-navy mb-3">Contact</h2>
          <p className="font-body text-gray-600 leading-relaxed">
            <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">
              mfox@foxmortgage.ca
            </a>
          </p>
        </div>

        <div className="border-t border-gray-100 pt-8">
          <p className="font-body text-xs text-gray-400">
            © {new Date().getFullYear()} 2802551 Ontario Inc. o/a Fox Mortgage. Internal use only.
          </p>
        </div>

      </div>
    </main>
  )
}
