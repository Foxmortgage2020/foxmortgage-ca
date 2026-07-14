// Server gate + shell for the admin command centre. Every route under
// /portal/admin renders inside this layout: unauthenticated users go to
// sign-in, authenticated users without a recognized admin-area role go back
// to the portal dispatcher. Nav items are filtered through can() and then
// role-scoped for presentation (agent-only users see Today, Pipeline,
// Market, and Ask Fox) before they reach the client shell. Presentation
// scoping never widens access; server-side authorization on each route is
// unchanged and remains the enforcement.

// Shell type faces (OFL, vendored via fontsource): Archivo for the UI,
// Fraunces for the single serif moment (the Home greeting).
import '@fontsource-variable/archivo'
import '@fontsource-variable/fraunces'

import {
  ADMIN_NAV,
  ASK_FOX,
  NAV_GROUP_LABELS,
  PORTAL_QUICK_LINKS,
  scopeNavForRoles,
  type AdminNavGroupKey,
} from '@/config/admin-nav'
import { can, getSessionUser } from '@/lib/authz'
import AdminShell, { type ShellNavGroup } from '@/components/admin/AdminShell'
import { isDemoMode } from '@/lib/demo'
import { redirect } from 'next/navigation'

const GROUP_ORDER: AdminNavGroupKey[] = ['today', 'pipeline', 'market', 'practice', 'system']

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

  const portalLinks = can(user, 'portals.view-as') ? PORTAL_QUICK_LINKS : []
  const askFoxHref = can(user, ASK_FOX.permission) ? ASK_FOX.href : null
  // Session 9: demo mode is honored only for admins with the flag set; the
  // predicate itself is env-fenced and cookie-signed (lib/demo.ts).
  const demoMode = can(user, 'demo.mode') && isDemoMode()

  return (
    <AdminShell
      groups={groups}
      portalLinks={portalLinks}
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
