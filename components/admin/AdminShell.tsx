'use client'

// The Command Centre shell (2026-07-14 redesign): a calm machine with loud
// exceptions. Ink-navy sidebar in five groups plus a persistent Ask Fox
// footer, white topbar on a fog canvas, collapsible 68px rail persisted per
// user, and decision badges fed by /api/portal/admin/desk.
//
// THE LIME RULE (design contract, audited by tests/shell.test.ts): the
// `decision` token appears ONLY where a human decision is queued — group
// dots, item badges — plus the keyboard focus ring on dark, which the
// redesign brief sanctions explicitly. Active nav, hovers, brand, and the
// user card are navy family: informational, never lime.
//
// Nav items arrive from the server layout ALREADY filtered through can()
// and role scoping — this component renders what it is given and never
// widens access. Server-side authorization remains the enforcement.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import CommandPalette from '@/components/admin/CommandPalette'
import NotificationBell from '@/components/admin/NotificationBell'
import DemoBanner from '@/components/admin/DemoBanner'
import InstallHint from '@/components/InstallHint'
import type { LenderTarget, NavItemLike } from '@/lib/search'
import {
  Activity,
  BookOpen,
  BookUser,
  Calculator,
  CalendarClock,
  ClipboardList,
  DollarSign,
  ExternalLink,
  FolderOpen,
  History,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  Radar,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'

const ICONS: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  FolderOpen,
  ClipboardList,
  RefreshCw,
  TrendingUp,
  Percent,
  Radar,
  BookOpen,
  History,
  MessageSquareText,
  Shield,
  DollarSign,
  Users,
  BookUser,
  Calculator,
  ScrollText,
  Activity,
  CalendarClock,
  Settings,
  Map,
}

export interface ShellNavItem {
  label: string
  href: string
  iconKey: string
}

export interface ShellNavGroup {
  key: string
  // null = the ungrouped Today item at the top.
  label: string | null
  items: ShellNavItem[]
}

export interface ShellPortalLink {
  label: string
  href: string
}

type Props = {
  groups: ShellNavGroup[]
  portalLinks: ShellPortalLink[]
  // Searchable page catalogue for the command palette (top-level + sub-tabs),
  // and the lender jump list (empty when the user lacks rates.view). Both are
  // handed straight to CommandPalette; the shell never widens them.
  pageTargets?: NavItemLike[]
  lenderTargets?: LenderTarget[]
  userName: string
  // Rail state persists per user; the key carries the Clerk user id.
  userKey: string
  roleLabel?: string
  demoMode?: boolean
  // null when the user lacks agent.use — the footer button simply absent.
  askFoxHref: string | null
  children: React.ReactNode
}

// Decision badges by nav href, polled from the Desk. Mount + window focus +
// a slow 5 minute interval; the badge is a pointer, the page is the truth.
function useDeskBadges(): Record<string, number> {
  const [badges, setBadges] = useState<Record<string, number>>({})
  const load = useCallback(() => {
    fetch('/api/portal/admin/desk')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d && d.badges && typeof d.badges === 'object') setBadges(d.badges)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    const t = setInterval(load, 5 * 60 * 1000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(t)
    }
  }, [load])
  return badges
}

const focusDark =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-decision'
const focusLight =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy'

export default function AdminShell({
  groups,
  portalLinks,
  pageTargets,
  lenderTargets,
  userName,
  userKey,
  roleLabel,
  demoMode = false,
  askFoxHref,
  children,
}: Props) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { signOut } = useClerk()
  const badges = useDeskBadges()

  const railKey = `fox_rail_v1:${userKey}`
  useEffect(() => {
    try {
      if (localStorage.getItem(railKey) === '1') setCollapsed(true)
    } catch {}
  }, [railKey])
  const toggleRail = () => {
    setCollapsed(c => {
      try {
        localStorage.setItem(railKey, c ? '0' : '1')
      } catch {}
      return !c
    })
  }

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

  const groupHasDecision = (g: ShellNavGroup) => g.items.some(i => (badges[i.href] ?? 0) > 0)

  const navLink = (item: ShellNavItem, rail: boolean, onNavigate?: () => void) => {
    const Icon = ICONS[item.iconKey] ?? LayoutDashboard
    const active = isActive(item.href)
    const badge = badges[item.href] ?? 0
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={rail ? item.label : undefined}
        aria-label={item.label}
        className={`relative flex items-center rounded-[7px] text-sm font-heading font-medium motion-safe:transition-colors ${focusDark} ${
          rail ? 'justify-center px-0 py-2.5' : 'gap-3 py-2 px-3'
        } ${active ? 'bg-ink-navy3 text-white font-semibold' : 'text-white/70 hover:bg-ink-navy2 hover:text-white'}`}
      >
        <span className="relative shrink-0">
          <Icon className="w-4 h-4" />
          {/* Collapsed rail: the decision count becomes a dot on the icon. */}
          {rail && badge > 0 && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-decision"
              aria-label={`${badge} waiting`}
            />
          )}
        </span>
        {!rail && <span className="flex-1 truncate">{item.label}</span>}
        {!rail && badge > 0 && (
          <span className="shrink-0 min-w-[18px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-decision text-decision-ink tabular-nums">
            {badge}
          </span>
        )}
      </Link>
    )
  }

  const navBody = (rail: boolean, onNavigate?: () => void) => (
    <nav className={`flex-1 overflow-y-auto py-3 ${rail ? 'px-2.5' : 'px-3'}`} aria-label="Sections">
      {groups.map(g => (
        <div key={g.key} className="mb-1">
          {g.label &&
            (rail ? (
              <div className="my-2 mx-2 border-t border-white/10" aria-hidden="true" />
            ) : (
              <p className="flex items-center gap-1.5 px-3 pt-4 pb-1.5 text-[10px] font-heading font-bold uppercase tracking-[1.6px] text-white/40">
                {g.label}
                {groupHasDecision(g) && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-decision"
                    aria-label="decisions waiting in this group"
                  />
                )}
              </p>
            ))}
          <div className="space-y-0.5">{g.items.map(i => navLink(i, rail, onNavigate))}</div>
        </div>
      ))}

      {portalLinks.length > 0 && !rail && (
        <div className="border-t border-white/10 pt-3 mt-3">
          <p className="px-3 pb-1.5 text-[10px] font-heading font-bold uppercase tracking-[1.6px] text-white/40">
            Portals
          </p>
          {portalLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 py-1.5 px-3 rounded-[7px] text-[13px] font-ui text-white/60 hover:bg-ink-navy2 hover:text-white motion-safe:transition-colors ${focusDark}`}
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )

  const footer = (rail: boolean) => (
    <div className={`border-t border-white/10 ${rail ? 'px-2.5 py-3' : 'px-3 py-3'}`}>
      {askFoxHref && (
        <Link
          href={askFoxHref}
          title={rail ? 'Ask Fox' : undefined}
          className={`flex items-center rounded-[7px] bg-white/10 text-white font-heading font-semibold text-sm hover:bg-white/15 motion-safe:transition-colors ${focusDark} ${
            rail ? 'justify-center py-2.5 mb-2' : 'gap-2.5 px-3 py-2.5 mb-3'
          }`}
        >
          <MessageSquareText className="w-4 h-4 shrink-0" />
          {!rail && <span>Ask Fox</span>}
        </Link>
      )}
      <div className={`flex items-center ${rail ? 'justify-center' : 'gap-2.5'}`}>
        <div className="w-8 h-8 rounded-full bg-white/10 text-white/90 flex items-center justify-center font-ui font-bold text-[11px] shrink-0">
          {initials}
        </div>
        {!rail && (
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-ui font-medium text-white truncate">{userName}</div>
            <div className="text-[10px] font-ui text-white/50 truncate">{roleLabel || 'admin'}</div>
          </div>
        )}
        {!rail && (
          <button
            onClick={() => signOut({ redirectUrl: '/portal/sign-in' })}
            aria-label="Sign out"
            title="Sign out"
            className={`p-1.5 rounded text-white/50 hover:text-white hover:bg-ink-navy2 ${focusDark}`}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )

  const brand = (rail: boolean) => (
    <div
      className={`flex items-center border-b border-white/10 ${rail ? 'justify-center px-2 py-4' : 'gap-2.5 px-4 py-4'}`}
    >
      <Link
        href="/portal/admin"
        className={`flex items-center gap-2.5 ${focusDark} rounded`}
        aria-label="Fox Mortgage, Today"
      >
        <span className="w-7 h-7 rounded-md bg-white text-ink-navy flex items-center justify-center font-heading font-extrabold text-sm shrink-0">
          F
        </span>
        {!rail && (
          <span className="leading-tight">
            <span className="block font-heading font-bold text-[15px] text-white">Fox Mortgage</span>
            <span className="block text-[10px] font-heading uppercase tracking-[1.4px] text-white/40">
              Command centre
            </span>
          </span>
        )}
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-fog font-ui text-ink">
      {/* Mobile drawer (always expanded style) */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-ink-navy text-white flex flex-col shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand(false)}
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className={`p-2 rounded hover:bg-ink-navy2 ${focusDark}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {navBody(false, () => setDrawerOpen(false))}
            {footer(false)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar: 248px expanded, 68px collapsed rail */}
      <aside
        className={`hidden lg:flex fixed left-0 top-0 bottom-0 bg-ink-navy text-white flex-col z-40 motion-safe:transition-[width] motion-safe:duration-200 ${
          collapsed ? 'w-[68px]' : 'w-[248px]'
        }`}
      >
        {brand(collapsed)}
        {navBody(collapsed)}
        {footer(collapsed)}
      </aside>

      {/* Content */}
      <main
        className={`min-h-screen motion-safe:transition-[margin] motion-safe:duration-200 ${
          collapsed ? 'lg:ml-[68px]' : 'lg:ml-[248px]'
        }`}
      >
        {/* Sticky top chrome: the demo banner (when on) stacks above one
            white topbar. The bar hosts the ONE command palette + bell,
            mounted once, so the ⌘K listener and the poll never double up. */}
        <div className="sticky top-0 z-40">
          <DemoBanner active={demoMode} />
          <header className="bg-white border-b border-hairline flex items-center gap-2 h-14 px-3 lg:px-5">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className={`lg:hidden p-1.5 rounded text-ink hover:bg-fog ${focusLight}`}
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={toggleRail}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              className={`hidden lg:inline-flex p-1.5 rounded text-muted hover:bg-fog hover:text-ink motion-safe:transition-colors ${focusLight}`}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <Link
              href="/portal/admin"
              className={`lg:hidden font-heading font-bold text-ink-navy ${focusLight} rounded`}
            >
              Fox Mortgage
            </Link>
            <div className="flex-1" />
            <CommandPalette
              navItems={groups.flatMap(g => g.items)}
              pageTargets={pageTargets}
              lenderTargets={lenderTargets}
              askFoxHref={askFoxHref}
            />
            <NotificationBell />
            <div className="lg:hidden w-8 h-8 rounded-full bg-ink-navy text-white flex items-center justify-center font-ui font-bold text-xs">
              {initials}
            </div>
          </header>
        </div>
        <InstallHint variant="admin" />
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
