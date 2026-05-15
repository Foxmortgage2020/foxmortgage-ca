'use client'

import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { LogOut, Mail } from 'lucide-react'

interface InactiveClientProps {
  fullName: string
}

// Minimal inactive-account landing. Single mailto CTA, sign-out in the
// header. No portal navigation, no deal lists, no documents. The user
// has nothing they can do here except email Mike or sign out.
export default function InactiveClient({ fullName }: InactiveClientProps) {
  const router = useRouter()
  const { signOut } = useClerk()

  const handleSignOut = async () => {
    await signOut(() => router.push('/portal/sign-in'))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header — only logo + sign-out, no portal nav */}
      <header className="bg-navy text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold text-white text-lg">Fox</span>
          <span className="font-heading font-bold text-lime text-lg">Mortgage</span>
        </div>
        <div className="flex items-center gap-4 text-sm font-body">
          <span className="text-gray-300">{fullName}</span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      {/* Body — single centered card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-xl w-full p-8 sm:p-10">
          <p className="font-heading text-lime text-sm tracking-wider uppercase mb-2">
            Fox Mortgage · Investor Portal
          </p>
          <h1 className="font-heading text-navy text-3xl font-bold mb-4">
            Your account is currently inactive.
          </h1>
          <p className="font-body text-gray-700 text-base leading-relaxed mb-4">
            Your investor account with Fox Mortgage is currently marked
            inactive. This may be temporary.
          </p>
          <p className="font-body text-gray-700 text-base leading-relaxed mb-6">
            Please reach out to Mike at{' '}
            <a
              href="mailto:mfox@foxmortgage.ca"
              className="text-lime hover:underline font-semibold"
            >
              mfox@foxmortgage.ca
            </a>{' '}
            to discuss reactivating your account.
          </p>

          <a
            href="mailto:mfox@foxmortgage.ca"
            className="inline-flex items-center gap-2 bg-lime text-navy font-heading font-bold text-base px-6 py-3 rounded-lg hover:bg-lime-dark transition-colors"
          >
            <Mail className="w-4 h-4" />
            Email Mike
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <p className="text-gray-500 text-xs font-body text-center">
          Michael Fox · Mortgage Agent, Level 2 · BRX Mortgage · FSRA #13463
        </p>
      </footer>
    </div>
  )
}
