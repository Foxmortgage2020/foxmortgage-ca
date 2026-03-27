'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from 'lucide-react'

// Mock user — change role to 'realtor' to see realtor view. Will be replaced by Clerk user metadata.
const MOCK_USER = { name: 'John Smith', firm: 'Smith Financial Planning', role: 'financial-planner' as 'financial-planner' | 'realtor' }

const navItems = [
  { label: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/portal/clients', icon: Users },
  { label: 'Add Referral', href: '/portal/add-referral', icon: UserPlus },
  { label: 'Reports', href: '/portal/reports', icon: BarChart2 },
  { label: 'Assets', href: '/portal/assets', icon: FolderOpen },
  { label: 'Training', href: '/portal/training', icon: GraduationCap },
  { label: 'Compliance', href: '/portal/compliance', icon: Shield },
  { label: 'Support', href: '/portal/support', icon: HelpCircle },
]

const pageTitles: Record<string, string> = {
  '/portal/dashboard': 'Dashboard',
  '/portal/clients': 'Clients',
  '/portal/add-referral': 'Add Referral',
  '/portal/reports': 'Reports',
  '/portal/assets': 'Marketing Assets',
  '/portal/training': 'Training',
  '/portal/compliance': 'Compliance',
  '/portal/support': 'Support',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Sign-in page has its own layout — don't wrap it
  if (pathname === '/portal/sign-in') {
    return <>{children}</>
  }

  const pageTitle = pageTitles[pathname] || (pathname.startsWith('/portal/clients/') ? 'Client File' : 'Portal')
  const roleBadge = MOCK_USER.role === 'financial-planner' ? 'Financial Planner' : 'Realtor Partner'

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
            const active = pathname === item.href || (item.href !== '/portal/dashboard' && pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 py-3 px-4 rounded-lg text-sm font-body transition-colors ${
                  active
                    ? 'bg-lime text-navy font-semibold'
                    : 'text-gray-300 hover:bg-white/10'
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
              {MOCK_USER.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{MOCK_USER.name}</div>
              <div className="text-[10px] bg-lime/20 text-lime px-2 py-0.5 rounded-full inline-block mt-0.5">{roleBadge}</div>
            </div>
          </div>
          <button className="flex items-center gap-2 text-gray-400 hover:text-white text-xs mt-3 font-body">
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
          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-navy">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center font-heading font-bold text-xs">
              {MOCK_USER.name.split(' ').map(n => n[0]).join('')}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
