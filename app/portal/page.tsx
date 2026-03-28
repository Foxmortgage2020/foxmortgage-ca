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

    const roles = user.publicMetadata?.roles as string[] || []
    const role = user.publicMetadata?.role as string

    // Admin always goes to admin dashboard first
    if (role === 'admin' || roles.includes('admin')) {
      router.push('/portal/admin')
      return
    }

    // Investor only
    if (roles.length === 1 && roles.includes('investor')) {
      router.push('/portal/investor/dashboard')
      return
    }

    // Default: realtor, financial planner, or multi-role
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
