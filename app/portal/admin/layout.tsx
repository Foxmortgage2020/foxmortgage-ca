// Server gate + shell for the admin command center. Every route under
// /portal/admin renders inside this layout: unauthenticated users go to
// sign-in, authenticated users without a recognized admin-area role go back
// to the portal dispatcher. Nav items are filtered through can() before
// they reach the client shell, so a future ops or agent role sees only its
// permitted sections.

import { ADMIN_NAV, PORTAL_QUICK_LINKS } from '@/config/admin-nav'
import { can, getSessionUser } from '@/lib/authz'
import AdminShell, { type ShellNavItem } from '@/components/admin/AdminShell'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/portal/sign-in')
  // deals.view is the broadest command-center permission; a user holding
  // none of the matrix roles has no business past this point.
  if (!can(user, 'deals.view')) redirect('/portal')

  const items: ShellNavItem[] = ADMIN_NAV.filter(i => can(user, i.permission)).map(i => ({
    label: i.label,
    href: i.href,
    iconKey: i.iconKey,
    sessionTag: i.arrivesInSession,
  }))
  const portalLinks = can(user, 'portals.view-as') ? PORTAL_QUICK_LINKS : []

  return (
    <AdminShell items={items} portalLinks={portalLinks} userName={user.name}>
      {children}
    </AdminShell>
  )
}
