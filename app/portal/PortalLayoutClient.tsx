'use client'

import { useClerk, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  BarChart2,
  FolderOpen,
  GraduationCap,
  Shield,
  HelpCircle,
  Bell,
  LogOut,
  TrendingUp,
  Search,
  FileText,
  User,
  MessageSquare,
  BookOpen,
  ClipboardList,
} from 'lucide-react'
import type { ImpersonationContext } from '@/lib/auth'
import PartnerPicker from '@/components/PartnerPicker'

const partnerNavItems = [
  { label: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/portal/clients', icon: Users },
  { label: 'Add Referral', href: '/portal/add-referral', icon: UserPlus },
  { label: 'Reports', href: '/portal/reports', icon: BarChart2 },
  { label: 'Assets', href: '/portal/assets', icon: FolderOpen },
  { label: 'Training', href: '/portal/training', icon: GraduationCap },
  { label: 'Compliance', href: '/portal/compliance', icon: Shield },
  { label: 'Support', href: '/portal/support', icon: HelpCircle },
]

const investorNavItems = [
  { label: 'Dashboard', href: '/portal/investor/dashboard', icon: LayoutDashboard },
  { label: 'My Investments', href: '/portal/investor/portfolio', icon: TrendingUp },
  { label: 'Opportunities', href: '/portal/investor/opportunities', icon: Search },
  { label: 'Reports', href: '/portal/investor/statements', icon: FileText },
  { label: 'My Profile', href: '/portal/investor/profile', icon: User },
  { label: 'Support', href: '/portal/investor/support', icon: HelpCircle },
]

const adminNavItems = [
  { label: 'Admin Dashboard', href: '/portal/admin', icon: LayoutDashboard },
]

const adminToolsNavItems = [
  { label: 'Bookkeeping', href: '/portal/bookkeeping', icon: BookOpen },
  { label: 'Review Queue', href: '/portal/bookkeeping/review-queue', icon: ClipboardList },
]

const fpNavItems = [
  { label: 'Dashboard', href: '/portal/fp/dashboard', icon: LayoutDashboard },
  { label: 'My Clients', href: '/portal/fp/clients', icon: Users },
  { label: 'Add Referral', href: '/portal/fp/add-referral', icon: UserPlus },
  { label: 'Messages', href: '/portal/fp/messages', icon: MessageSquare },
  { label: 'Support', href: '/portal/fp/support', icon: HelpCircle },
]

const partnerPageTitles: Record<string, string> = {
  '/portal/dashboard': 'Dashboard',
  '/portal/clients': 'Clients',
  '/portal/add-referral': 'Add Referral',
  '/portal/reports': 'Reports',
  '/portal/assets': 'Marketing Assets',
  '/portal/training': 'Training',
  '/portal/compliance': 'Compliance',
  '/portal/support': 'Support',
}

const investorPageTitles: Record<string, string> = {
  '/portal/investor/dashboard': 'Dashboard',
  '/portal/investor/portfolio': 'My Investments',
  '/portal/investor/opportunities': 'Opportunities',
  '/portal/investor/statements': 'Reports',
  '/portal/investor/profile': 'My Profile',
  '/portal/investor/support': 'Support',
}

const fpPageTitles: Record<string, string> = {
  '/portal/fp/dashboard': 'Dashboard',
  '/portal/fp/clients': 'My Clients',
  '/portal/fp/add-referral': 'Add Referral',
  '/portal/fp/messages': 'Messages',
  '/portal/fp/support': 'Support',
}

type PickerRole = 'fp' | 'investor' | 'realtor'

type Props = {
  children: React.ReactNode
  impersonation: ImpersonationContext | null
}

export default function PortalLayoutClient({ children, impersonation }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useClerk()
  const { user } = useUser()

  // Partner-picker state — only used by admin
  const [pickerOpen, setPickerOpen] = useState<PickerRole | null>(null)
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null)
  const adminPillRef = useRef<HTMLButtonElement | null>(null)
  const partnerPillRef = useRef<HTMLButtonElement | null>(null)
  const fpPillRef = useRef<HTMLButtonElement | null>(null)
  const investorPillRef = useRef<HTMLButtonElement | null>(null)

  // Sign-in page and redirect hub render without sidebar
  if (pathname?.includes('/portal/sign-in') || pathname === '/portal') {
    return <>{children}</>
  }

  // Derive roles from Clerk user metadata
  const metadata = user?.publicMetadata as { roles?: string[]; role?: string } | undefined
  const userRoles = metadata?.roles || (metadata?.role ? [metadata.role] : [])

  const isInvestorPortal = pathname?.startsWith('/portal/investor')
  const isAdminPortal = pathname?.startsWith('/portal/admin') || pathname?.startsWith('/portal/bookkeeping')
  const isFPPortal = pathname?.startsWith('/portal/fp')
  const isAdmin = userRoles.includes('admin')
  const isImpersonating = impersonation !== null

  // Determine nav items based on current portal route
  let navItems = partnerNavItems
  if (isAdminPortal) navItems = adminNavItems
  else if (isInvestorPortal) navItems = investorNavItems
  else if (isFPPortal) navItems = fpNavItems

  // Page title
  let pageTitle = 'Portal'
  if (pathname?.startsWith('/portal/bookkeeping/review-queue')) {
    pageTitle = 'Review Queue'
  } else if (pathname?.startsWith('/portal/bookkeeping/projects')) {
    pageTitle = 'Production Contracts'
  } else if (pathname?.startsWith('/portal/bookkeeping')) {
    pageTitle = 'Bookkeeping Agent'
  } else if (isAdminPortal) {
    pageTitle = 'Admin Dashboard'
  } else if (isInvestorPortal) {
    pageTitle = investorPageTitles[pathname] || 'Portal'
    if (pathname.startsWith('/portal/investor/portfolio/')) pageTitle = 'Investment Details'
    if (pathname.startsWith('/portal/investor/opportunities/')) pageTitle = 'Investment File'
  } else if (isFPPortal) {
    pageTitle = fpPageTitles[pathname] || 'Portal'
    if (pathname.startsWith('/portal/fp/clients/')) pageTitle = 'Client File'
  } else {
    pageTitle = partnerPageTitles[pathname] || 'Portal'
    if (pathname.startsWith('/portal/clients/')) pageTitle = 'Client File'
  }

  // ─── Identity badge — reflect impersonated partner when impersonating ──────
  // When admin is impersonating, show the partner's identity in the bottom-left
  // badge (and top-right initial circle) so it's visible at a glance that the
  // view is on someone else's behalf. The "(via Admin)" tag below the name
  // disambiguates from a real partner login.
  const actorName = user?.fullName || user?.firstName || 'Partner User'
  const displayName = isImpersonating ? impersonation!.partnerName : actorName
  const displayInitials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()

  // Role label
  let roleLabel: string
  if (isImpersonating) {
    roleLabel = impersonation!.role === 'fp' ? 'Financial Planner' : 'Private Investor'
  } else if (isAdminPortal) {
    roleLabel = 'Admin'
  } else if (isInvestorPortal) {
    roleLabel = 'Private Investor'
  } else if (userRoles.includes('financial-planner')) {
    roleLabel = 'Financial Planner'
  } else if (userRoles.includes('investor') && !userRoles.includes('realtor')) {
    roleLabel = 'Private Investor'
  } else {
    roleLabel = 'Realtor Partner'
  }

  // Switcher visibility — admin or multi-role users
  const showSwitcher =
    isAdmin ||
    (userRoles.includes('realtor') && userRoles.includes('investor')) ||
    (userRoles.includes('financial-planner') && userRoles.includes('investor'))

  // Banners:
  //  - Impersonation banner: amber, partner identity, Exit button
  //  - Fallback admin banner: navy/grey "Viewing as Admin — <portal>", shown
  //    when an admin is on a sub-portal but NOT impersonating
  const showImpersonationBanner = isImpersonating
  const showAdminBanner = isAdmin && !isAdminPortal && !isImpersonating

  // ─── Pill click handlers (admin gets the picker; non-admin keeps existing) ──
  async function exitImpersonation() {
    try {
      await fetch('/api/admin/impersonate/exit', { method: 'POST' })
    } catch {
      // Best-effort — even if the request errored, the user wanted to exit
    }
    router.refresh()
  }

  function handleAdminPillClick() {
    if (isImpersonating) {
      void (async () => {
        await exitImpersonation()
        router.push('/portal/admin')
      })()
    } else {
      router.push('/portal/admin')
    }
  }

  function handlePartnerPillClick() {
    // Realtor portal — picker not implemented today (no live realtor partners);
    // keep current direct-navigation behavior.
    router.push('/portal/dashboard')
  }

  function handleFPPillClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (isAdmin) {
      setPickerAnchor(e.currentTarget)
      setPickerOpen('fp')
    } else {
      router.push('/portal/fp/dashboard')
    }
  }

  function handleInvestorPillClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (isAdmin) {
      setPickerAnchor(e.currentTarget)
      setPickerOpen('investor')
    } else {
      router.push('/portal/investor/dashboard')
    }
  }

  async function handlePartnerSelect(partner: { zohoId: string; name: string; role: PickerRole }) {
    setPickerOpen(null)
    setPickerAnchor(null)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: partner.role, partnerId: partner.zohoId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('[impersonate] failed', res.status, data)
        return
      }
    } catch (err) {
      console.error('[impersonate] error', err)
      return
    }
    const dest =
      partner.role === 'fp' ? '/portal/fp/dashboard'
        : partner.role === 'investor' ? '/portal/investor/dashboard'
        : '/portal/dashboard'
    router.push(dest)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-navy text-white flex flex-col z-40">
        <div className="px-6 py-6 border-b border-white/10">
          <Link href="/" className="font-heading font-bold text-xl">
            Fox <span className="text-lime">Mortgage</span>
          </Link>
          <p className="text-xs text-gray-400 mt-1">Strategic Mortgage Monitoring</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isBase =
              item.href === '/portal/dashboard' ||
              item.href === '/portal/investor/dashboard' ||
              item.href === '/portal/admin'
            const active =
              pathname === item.href || (!isBase && pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 py-3 px-4 rounded-lg text-sm font-body transition-colors ${
                  active ? 'bg-lime text-navy font-semibold' : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}

          {/* Admin tools section */}
          {isAdminPortal && (
            <div className="border-t border-white/10 pt-3 mt-3">
              <p className="text-gray-500 text-xs uppercase tracking-wider px-4 mb-2 font-body">
                Admin Tools
              </p>
              {adminToolsNavItems.map((item) => {
                const isBase = item.href === '/portal/bookkeeping'
                const active =
                  pathname === item.href || (!isBase && pathname.startsWith(item.href + '/'))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 py-3 px-4 rounded-lg text-sm font-body transition-colors ${
                      active ? 'bg-lime text-navy font-semibold' : 'text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          )}

          {/* Admin portal switcher in sidebar */}
          {isAdminPortal && (
            <div className="border-t border-white/10 pt-3 mt-3">
              <p className="text-gray-500 text-xs uppercase tracking-wider px-4 mb-2 font-body">
                Switch to Portal
              </p>
              <button
                onClick={() => router.push('/portal/dashboard')}
                className="flex items-center gap-3 py-2 px-4 rounded-lg w-full text-gray-400 hover:text-lime hover:bg-white/5 transition-colors text-sm font-body"
              >
                <Users className="w-4 h-4" />
                Partner Portal
              </button>
              <button
                onClick={() => router.push('/portal/fp/dashboard')}
                className="flex items-center gap-3 py-2 px-4 rounded-lg w-full text-gray-400 hover:text-lime hover:bg-white/5 transition-colors text-sm font-body"
              >
                <LayoutDashboard className="w-4 h-4" />
                FP Portal
              </button>
              <button
                onClick={() => router.push('/portal/investor/dashboard')}
                className="flex items-center gap-3 py-2 px-4 rounded-lg w-full text-gray-400 hover:text-lime hover:bg-white/5 transition-colors text-sm font-body"
              >
                <TrendingUp className="w-4 h-4" />
                Investor Portal
              </button>
            </div>
          )}

          {/* Admin dashboard link when viewing sub-portals */}
          {isAdmin && !isAdminPortal && (
            <div className="border-t border-white/10 pt-3 mt-3">
              <button
                onClick={() => router.push('/portal/admin')}
                className="flex items-center gap-3 py-2 px-4 rounded-lg w-full text-gray-400 hover:text-lime hover:bg-white/5 transition-colors text-sm font-body"
              >
                <LayoutDashboard className="w-4 h-4" />
                Admin Dashboard
              </button>
            </div>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-lime/20 text-lime flex items-center justify-center font-heading font-bold text-xs">
              {displayInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{displayName}</div>
              <div className="text-[10px] bg-lime/20 text-lime px-2 py-0.5 rounded-full inline-block mt-0.5">
                {roleLabel}
              </div>
              {isImpersonating && (
                <div className="text-[10px] text-amber-200/80 mt-1 font-body">
                  (via Admin)
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: '/portal/sign-in' })}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-xs mt-3 font-body cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="ml-64 flex-1 flex flex-col min-h-screen bg-gray-50">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8">
          <h1 className="font-heading font-bold text-navy text-lg">{pageTitle}</h1>

          {/* Portal Switcher */}
          {showSwitcher && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
              {isAdmin && (
                <button
                  ref={adminPillRef}
                  onClick={handleAdminPillClick}
                  className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
                    isAdminPortal ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-navy'
                  }`}
                >
                  Admin
                </button>
              )}
              {(isAdmin || userRoles.includes('realtor')) && (
                <button
                  ref={partnerPillRef}
                  onClick={handlePartnerPillClick}
                  className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
                    !isInvestorPortal && !isAdminPortal && !isFPPortal
                      ? 'bg-lime text-navy shadow-sm'
                      : 'text-gray-500 hover:text-navy'
                  }`}
                >
                  Partner
                </button>
              )}
              {(isAdmin || userRoles.includes('financial-planner')) && (
                <button
                  ref={fpPillRef}
                  onClick={handleFPPillClick}
                  className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
                    isFPPortal ? 'bg-lime text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
                  }`}
                >
                  FP Portal
                </button>
              )}
              <button
                ref={investorPillRef}
                onClick={handleInvestorPillClick}
                className={`px-3 py-1.5 rounded-full text-xs font-body font-medium transition-colors ${
                  isInvestorPortal ? 'bg-lime text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
                }`}
              >
                Investor
              </button>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-navy">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center font-heading font-bold text-xs">
              {displayInitials}
            </div>
          </div>
        </header>

        {/* Impersonation banner — admin viewing as a specific partner */}
        {showImpersonationBanner && impersonation && (
          <div className="bg-amber-50 border-b border-amber-300 px-8 py-2 flex items-center justify-between text-sm font-body">
            <span className="text-amber-900">
              👁 Viewing as{' '}
              <span className="font-semibold">{impersonation.partnerName}</span>
              {impersonation.partnerFirm ? ` — ${impersonation.partnerFirm}` : ''}
              {' · '}
              <span className="text-amber-800">Read-only</span>
            </span>
            <button
              onClick={async () => {
                await exitImpersonation()
                router.push('/portal/admin')
              }}
              className="text-lime font-semibold hover:underline text-xs"
            >
              Exit Impersonation
            </button>
          </div>
        )}

        {/* Admin viewing banner — admin on a sub-portal but NOT impersonating */}
        {showAdminBanner && (
          <div className="bg-navy/5 border-b border-navy/10 px-8 py-2 flex items-center justify-between text-sm font-body">
            <span className="text-navy/60">
              👁️ Viewing as Admin &mdash;{' '}
              <span className="font-semibold text-navy">
                {isInvestorPortal ? 'Investor Portal' : isFPPortal ? 'FP Portal' : 'Partner Portal'}
              </span>
            </span>
            <button
              onClick={() => router.push('/portal/admin')}
              className="text-lime font-semibold hover:underline text-xs"
            >
              ← Back to Admin Dashboard
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-8">{children}</main>
      </div>

      {/* Partner Picker popover (admin only) */}
      {pickerOpen && pickerAnchor && (
        <PartnerPicker
          role={pickerOpen}
          anchorEl={pickerAnchor}
          onClose={() => {
            setPickerOpen(null)
            setPickerAnchor(null)
          }}
          onSelect={(partner) =>
            handlePartnerSelect({
              zohoId: partner.zohoId,
              name: partner.name,
              role: pickerOpen,
            })
          }
        />
      )}
    </div>
  )
}
