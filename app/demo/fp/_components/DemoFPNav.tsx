'use client'

// Demo-only nav bar for /demo/fp. Mirrors the live FP sidebar's item set
// (Dashboard, My Clients, Messages, Support) minus "Add Referral" — the demo is
// read-only, so there is nothing to submit. No Clerk, no router actions; plain
// Links with active-state styling from usePathname.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, MessageSquare, HelpCircle } from 'lucide-react'

const navItems = [
  { label: 'Dashboard', href: '/demo/fp', icon: LayoutDashboard, exact: true },
  { label: 'My Clients', href: '/demo/fp/clients', icon: Users, exact: false },
  { label: 'Messages', href: '/demo/fp/messages', icon: MessageSquare, exact: false },
  { label: 'Support', href: '/demo/fp/support', icon: HelpCircle, exact: false },
]

export default function DemoFPNav() {
  const pathname = usePathname() ?? '/demo/fp'

  return (
    <nav className="border-t border-white/10">
      <div className="max-w-6xl mx-auto px-2 md:px-8 flex gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-body whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-lime text-lime font-semibold'
                  : 'border-transparent text-gray-300 hover:text-white'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
