'use client'

import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { SignIn } from '@clerk/nextjs'

const trustBullets = [
  'Real-time mortgage monitoring for your referred clients',
  'Proactive equity & savings alerts delivered to your inbox',
  'Branded co-marketing assets you can share instantly',
]

export default function SignInPage() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Left Panel */}
      <div className="w-full md:w-[40%] bg-navy text-white flex flex-col justify-between p-12">
        <div>
          <Link href="/" className="font-heading font-bold text-xl">
            Fox <span className="text-lime">Mortgage</span>
          </Link>
        </div>

        <div>
          <p className="text-lime text-xs uppercase tracking-widest font-body mb-3">
            Partner Portal
          </p>
          <h2 className="text-white text-3xl font-heading font-bold mb-4">
            Welcome Back
          </h2>
          <p className="text-gray-300 font-body text-sm leading-relaxed mb-8">
            Access your dedicated partner dashboard to monitor client mortgages,
            track referrals, and unlock real-time savings opportunities for the
            families you serve.
          </p>

          <ul className="space-y-4">
            {trustBullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-lime flex-shrink-0 mt-0.5" />
                <span className="text-gray-200 font-body text-sm">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-gray-400 text-xs font-body">
          Mortgage Agent, Level 2 &middot; BRX Mortgage &middot; FSRA #13463
        </p>
      </div>

      {/* Right Panel */}
      <div className="w-full md:w-[60%] bg-white flex flex-col justify-center p-12">
        <h2 className="font-heading text-navy text-2xl font-bold mb-2">Sign In</h2>
        <p className="text-gray-500 font-body text-sm mb-8">
          Access your Fox Mortgage partner dashboard
        </p>

        {/* Clerk SignIn */}
        <SignIn
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-none p-0 w-full',
              headerTitle: 'hidden',
              headerSubtitle: 'hidden',
              socialButtonsBlockButton: 'border border-gray-200',
              formButtonPrimary: 'bg-lime hover:bg-lime-dark text-navy font-heading font-bold',
              footerActionLink: 'text-navy font-semibold',
              footer: 'hidden',
            }
          }}
          redirectUrl="/portal"
          afterSignInUrl="/portal"
        />

        <p className="text-center text-xs font-body text-gray-400 mt-6">
          Secure access. For authorized partners and investors only.
        </p>
      </div>
    </div>
  )
}
