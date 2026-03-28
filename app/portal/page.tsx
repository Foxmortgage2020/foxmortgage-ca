'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function PortalRedirect() {
  const { user, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!isLoaded) return

    if (!user) {
      router.push('/portal/sign-in')
      return
    }

    const metadata = user.publicMetadata as {
      roles?: string[]
      role?: string
      zoho_partner_id?: string
    }

    const roles = metadata?.roles || []
    const role = metadata?.role || ''

    console.log('Portal redirect — roles:', roles, 'role:', role, 'metadata:', metadata)

    // Admin always goes to admin dashboard
    if (roles.includes('admin') || role === 'admin') {
      router.push('/portal/admin')
      return
    }

    // Investor only (not also a partner)
    if (
      roles.includes('investor') &&
      !roles.includes('realtor') &&
      !roles.includes('financial-planner')
    ) {
      router.push('/portal/investor/dashboard')
      return
    }

    // Multi-role with investor — default to partner, switcher handles the rest
    if (roles.includes('investor')) {
      router.push('/portal/dashboard')
      return
    }

    // Default: realtor, financial planner, or anything else
    router.push('/portal/dashboard')
  }, [isLoaded, user, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-lime border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-body text-navy font-semibold">Fox Mortgage</p>
        <p className="font-body text-gray-500 text-sm mt-1">Loading your portal...</p>
      </div>
    </div>
  )
}
