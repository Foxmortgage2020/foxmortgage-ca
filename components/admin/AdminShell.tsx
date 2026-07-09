'use client'

// Responsive shell for the admin command center. Desktop: fixed navy
// sidebar. Mobile: top bar + slide-in drawer. Nav items arrive from the
// server layout ALREADY filtered through can() — this component renders
// what it is given and never widens access.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import {
  Activity,
  BookOpen,
  Calculator,
  ClipboardList,
  DollarSign,
  ExternalLink,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Percent,
  Radar,
  ScrollText,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react'

const ICONS: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  FolderOpen,
  ClipboardList,
  Percent,
  Radar,
  BookOpen,
  Shield,
  DollarSign,
  Users,
  Calculator,
  ScrollText,
  Activity,
  Settings,
  Map,
}

export interface ShellNavItem {
  label: string
  href: string
  iconKey: string
  sessionTag?: number
}

export interface ShellPortalLink {
  label: string
  href: string
}

type Props = {
  items: ShellNavItem[]
  portalLinks: ShellPortalLink[]
  userName: string
  children: React.ReactNode
}

export default function AdminShell({ items, portalLinks, userName, children }: Props) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { signOut } = useClerk()

  const initials =
    userName
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'A'

  const isActive = (href: string) =>
    href === '/portal/admin'
      ? pathname === href
      : pathname === href || Boolean(pathname?.startsWith(href + '/'))

  const navBody = (onNavigate?: () => void) => (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {items.map(item => {
        const Icon = ICONS[item.iconKey] ?? LayoutDashboard
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 py-2.5 px-4 rounded-lg text-sm font-body transition-colors ${
              active ? 'bg-lime text-navy font-semibold' : 'text-gray-300 hover:bg-white/10'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.sessionTag ? (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  active ? 'bg-navy/10 text-navy' : 'bg-white/10 text-gray-400'
                }`}
              >
                S{item.sessionTag}
              </span>
            ) : null}
          </Link>
        )
      })}

      {portalLinks.length > 0 && (
        <div className="border-t border-white/10 pt-3 mt-3">
          <p className="text-gray-500 text-xs uppercase tracking-wider px-4 mb-2 font-body">
            Open a portal
          </p>
          {portalLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className="flex items-center gap-3 py-2 px-4 rounded-lg text-gray-400 hover:text-lime hover:bg-white/5 transition-colors text-sm font-body"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )

  const footer = (
    <div className="px-4 py-4 border-t border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-lime/20 text-lime flex items-center justify-center font-heading font-bold text-xs">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{userName}</div>
          <div className="text-[10px] bg-lime/20 text-lime px-2 py-0.5 rounded-full inline-block mt-0.5">
            Admin
          </div>
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
  )

  const brand = (
    <div className="px-6 py-5 border-b border-white/10">
      <Link href="/portal/admin" className="font-heading font-bold text-xl text-white">
        Fox <span className="text-lime">Mortgage</span>
      </Link>
      <p className="text-xs text-gray-400 mt-1">Command Center</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 bg-navy text-white flex items-center justify-between px-4 h-14">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          className="p-1.5 -ml-1.5 rounded hover:bg-white/10"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/portal/admin" className="font-heading font-bold">
          Fox <span className="text-lime">Mortgage</span>
        </Link>
        <div className="w-8 h-8 rounded-full bg-lime/20 text-lime flex items-center justify-center font-heading font-bold text-xs">
          {initials}
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-navy text-white flex flex-col shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="p-2 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {navBody(() => setDrawerOpen(false))}
            {footer}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 bg-navy text-white flex-col z-40">
        {brand}
        {navBody()}
        {footer}
      </aside>

      {/* Content */}
      <main className="lg:ml-60 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
