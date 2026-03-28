'use client'

import { useClerk } from '@clerk/nextjs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
} from 'lucide-react'

// Mock user — will be replaced by Clerk user metadata.
const MOCK_PARTNER = { name: 'John Smith', firm: 'Smith Financial Planning', role: 'financial-planner' as 'financial-planner' | 'realtor' }
const MOCK_INVESTOR = { name: 'Michael Fox', initials: 'MF' }

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
  { label: 'Statements', href: '/portal/investor/statements', icon: FileText },
  { label: 'My Profile', href: '/portal/investor/profile', icon: User },
  { label: 'Documents', href: '/portal/investor/documents', icon: FolderOpen },
  { label: 'Support', href: '/portal/investor/support', icon: HelpCircle },
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
  '/portal/investor/statements': 'Statements',
  '/portal/investor/profile': 'My Profile',
  '/portal/investor/documents': 'Documents',
  '/portal/investor/support': 'Support',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useClerk()

  // Hardcoded for now — will come from Clerk user metadata later
  const role = 'admin'

  // Sign-in page renders without sidebar
  if (pathname?.includes('/portal/sign-in')) {
    return <>{children}</>
  }

  const isInvestorPortal = pathname?.startsWith('/portal/investor')
  const navItems = isInvestorPortal ? investorNavItems : partnerNavItems
  const pageTitles = isInvestorPortal ? investorPageTitles : partnerPageTitles

  let pageTitle = pageTitles[pathname] || 'Portal'
  if (!pageTitle || pageTitle === 'Portal') {
    if (pathname.startsWith('/portal/clients/')) pageTitle = 'Client File'
    else if (pathname.startsWith('/portal/investor/portfolio/')) pageTitle = 'Investment Details'
    else if (pathname.startsWith('/portal/investor/opportunities/')) pageTitle = 'Investment File'
  }

  const userName = isInvestorPortal ? MOCK_INVESTOR.name : MOCK_PARTNER.name
  const userInitials = isInvestorPortal ? MOCK_INVESTOR.initials : MOCK_PARTNER.name.split(' ').map(n => n[0]).join('')
  const roleBadge = isInvestorPortal ? 'Private Investor' : (MOCK_PARTNER.role === 'financial-planner' ? 'Financial Planner' : 'Realtor Partner')

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
            const isBase = isInvestorPortal ? item.href === '/portal/investor/dashboard' : item.href === '/portal/dashboard'
            const active = pathname === item.href || (!isBase && pathname.startsWith(item.href + '/'))
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
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-lime/20 text-lime flex items-center justify-center font-heading font-bold text-xs">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{userName}</div>
              <div className="text-[10px] bg-lime/20 text-lime px-2 py-0.5 rounded-full inline-block mt-0.5">{roleBadge}</div>
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
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8">
          <h1 className="font-heading font-bold text-navy text-lg">{pageTitle}</h1>

          {/* Portal Switcher — admin only */}
          {role === 'admin' && (
            <div className="flex items-center bg-gray-100 rounded-full p-1 gap-1">
              <button
                onClick={() => router.push('/portal/dashboard')}
                className={`px-4 py-1.5 rounded-full text-sm font-body font-medium transition-colors ${
                  !isInvestorPortal
                    ? 'bg-lime text-navy shadow-sm'
                    : 'text-gray-500 hover:text-navy'
                }`}
              >
                Partner Portal
              </button>
              <button
                onClick={() => router.push('/portal/investor/dashboard')}
                className={`px-4 py-1.5 rounded-full text-sm font-body font-medium transition-colors ${
                  isInvestorPortal
                    ? 'bg-lime text-navy shadow-sm'
                    : 'text-gray-500 hover:text-navy'
                }`}
              >
                Investor Portal
              </button>
            </div>
          )}

          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-navy">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center font-heading font-bold text-xs">
              {userInitials}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
