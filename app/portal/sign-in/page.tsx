'use client'

import Link from 'next/link'
import { Home, TrendingUp, DollarSign, Mail, Lock, CheckCircle } from 'lucide-react'
import { useState } from 'react'

// TODO: Wire to Clerk SignIn component

const portalTypes = [
  {
    title: 'Realtor Partner Portal',
    subtitle: 'Referrals & client monitoring',
    icon: Home,
  },
  {
    title: 'Financial Planner Portal',
    subtitle: 'Client mortgage planning',
    icon: TrendingUp,
  },
  {
    title: 'Private Investor Portal',
    subtitle: 'Deal flow & returns',
    icon: DollarSign,
  },
]

const trustBullets = [
  'Real-time mortgage monitoring for your referred clients',
  'Proactive equity & savings alerts delivered to your inbox',
  'Branded co-marketing assets you can share instantly',
]

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
          Choose your portal type or sign in with email below.
        </p>

        {/* Portal Type Buttons */}
        <div className="space-y-3 mb-8">
          {portalTypes.map((portal) => (
            <button
              key={portal.title}
              className="w-full bg-navy text-white rounded-xl py-4 px-6 flex items-center gap-4 hover:bg-navy/90 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-lime flex items-center justify-center flex-shrink-0">
                <portal.icon className="w-5 h-5 text-navy" />
              </div>
              <div>
                <div className="font-heading font-semibold text-sm">{portal.title}</div>
                <div className="font-body text-xs text-gray-300">{portal.subtitle}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 font-body text-xs">or sign in with email</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Email Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-body font-medium text-navy mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-body font-medium text-navy mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
              />
            </div>
          </div>
        </div>

        <button className="bg-lime text-navy w-full py-3 rounded-lg font-heading font-bold text-sm hover:bg-lime-dark transition-colors mb-4">
          Sign In
        </button>

        <p className="text-center text-sm font-body text-gray-500">
          Need access?{' '}
          <Link href="/contact" className="text-navy font-semibold hover:underline">
            Contact Michael
          </Link>
        </p>
      </div>
    </div>
  )
}
