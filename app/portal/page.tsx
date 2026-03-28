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

    const role = user.publicMetadata?.role as string

    if (role === 'investor') {
      router.push('/portal/investor/dashboard')
    } else {
      router.push('/portal/dashboard')
    }
  }, [isLoaded, user, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-body text-gray-500 text-sm">Loading your portal...</p>
      </div>
    </div>
  )
}
