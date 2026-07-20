// Server gate + shell for the admin command centre. Every route under
// /portal/admin renders inside this layout: unauthenticated users go to
// sign-in, authenticated users without a recognized admin-area role go back
// to the portal dispatcher. Nav items are filtered through can() and then
// role-scoped for presentation (agent-only users see Today, Pipeline,
// Market, and Ask Fox) before they reach the client shell. Presentation
// scoping never widens access; server-side authorization on each route is
// unchanged and remains the enforcement.

// Shell type faces: the website's own pair (Poppins headings, Montserrat
// body — loaded by the root layout via next/font) since B2b; Fraunces stays
// vendored (OFL via fontsource) for the single serif moment (the Home
// greeting).
import '@fontsource-variable/fraunces'

import {
  ADMIN_NAV,
  ADMIN_SUB_PAGES,
  ASK_FOX,
  NAV_GROUP_LABELS,
  PORTAL_QUICK_LINKS,
  scopeNavForRoles,
  type AdminNavGroupKey,
} from '@/config/admin-nav'
import { HAND_WRITTEN_LENDER_SLUGS, lenderDisplayName } from '@/config/lenders'
import { can, getSessionUser } from '@/lib/authz'
import AdminShell, { type ShellNavGroup } from '@/components/admin/AdminShell'
import type { LenderTarget, NavItemLike } from '@/lib/search'
import { isDemoMode } from '@/lib/demo'
import { redirect } from 'next/navigation'

const GROUP_ORDER: AdminNavGroupKey[] = ['today', 'book', 'practice', 'system']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/portal/sign-in')
  // deals.view is the broadest command-centre permission; a user holding
  // none of the matrix roles has no business past this point.
  if (!can(user, 'deals.view')) redirect('/portal')

  const visible = scopeNavForRoles(
    ADMIN_NAV.filter(i => can(user, i.permission)),
    user.roles,
  )
  const groups: ShellNavGroup[] = GROUP_ORDER.map(key => ({
    key,
    label: key === 'today' ? null : NAV_GROUP_LABELS[key],
    items: visible
      .filter(i => i.group === key)
      .map(i => ({ label: i.label, href: i.href, iconKey: i.iconKey })),
  })).filter(g => g.items.length > 0)

  // The command palette searches a richer catalogue than the sidebar shows:
  // the visible top-level pages (now with their descriptions) plus the
  // consolidated sub-tabs the user can reach. Built from the same `visible`
  // set the sidebar renders, so palette and nav never disagree on scoping.
  const pageTargets: NavItemLike[] = [
    ...visible.map(i => ({ label: i.label, href: i.href, description: i.description })),
    ...ADMIN_SUB_PAGES.filter(p => can(user, p.permission)).map(p => ({
      label: p.label,
      href: p.href,
      description: p.description,
    })),
  ]
  // Lenders jump into the Rates by-lender view, so they ride rates.view. A
  // role without it receives none and the palette's Lenders group is absent.
  // Lender names are public reference data (they stay real in demo, like the
  // knowledge index), so this is a static list with no read and no PII.
  const lenderTargets: LenderTarget[] = can(user, 'rates.view')
    ? HAND_WRITTEN_LENDER_SLUGS.map(slug => ({ slug, name: lenderDisplayName(slug) })).sort((a, b) =>
        a.name.localeCompare(b.name),
      )
    : []

  const portalLinks = can(user, 'portals.view-as') ? PORTAL_QUICK_LINKS : []
  const askFoxHref = can(user, ASK_FOX.permission) ? ASK_FOX.href : null
  // Session 9: demo mode is honored only for admins with the flag set; the
  // predicate itself is env-fenced and cookie-signed (lib/demo.ts).
  const demoMode = can(user, 'demo.mode') && isDemoMode()

  return (
    <AdminShell
      groups={groups}
      portalLinks={portalLinks}
      pageTargets={pageTargets}
      lenderTargets={lenderTargets}
      userName={user.name}
      userKey={user.userId}
      roleLabel={user.roles.join(', ')}
      demoMode={demoMode}
      askFoxHref={askFoxHref}
    >
      {children}
    </AdminShell>
  )
}
