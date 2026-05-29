// Role-aware portal entry redirect.
//
// The legacy /portal/dashboard was a hardcoded seed page ("Welcome back,
// John", $45.2M / $128M mock tiles, a static webinar banner) shared by every
// partner — it never read the viewer's record. It is retired. Each partner
// type now has its own live-data dashboard and admins have the admin
// dashboard, so this route is a thin server redirect to the right place.
//
// Impersonation-first: when an admin is "viewing as" a partner, the signed
// (read-only) impersonation cookie decides the destination so the admin lands
// on that partner's real dashboard. getPortalContext only honors the cookie
// for admins, so this is safe for everyone else.
//
// Role routing mirrors /portal/sign-in to stay consistent.

import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function PortalDashboardRedirect() {
  const ctx = await getPortalContext()
  if (!ctx) redirect('/portal/sign-in')

  // Impersonation wins — admin viewing as a partner goes to that partner's
  // dashboard (data resolves from the impersonation cookie, read-only).
  const impRole = ctx.impersonation?.role
  if (impRole === 'realtor') redirect('/portal/realtor/dashboard')
  if (impRole === 'lawyer') redirect('/portal/lawyer/dashboard')
  if (impRole === 'fp') redirect('/portal/fp/dashboard')
  if (impRole === 'investor') redirect('/portal/investor/dashboard')

  // Otherwise route by the signed-in actor's own role.
  const roles = ctx.actor.roles
  if (roles.includes('admin')) redirect('/portal/admin')
  if (roles.includes('financial-planner')) redirect('/portal/fp/dashboard')
  if (roles.includes('realtor')) redirect('/portal/realtor/dashboard')
  if (roles.includes('lawyer')) redirect('/portal/lawyer/dashboard')
  if (roles.includes('investor')) redirect('/portal/investor/dashboard')

  // Authenticated but no recognized portal role — back to sign-in, which
  // renders the form and clears the stale session. Never loops: the sign-in
  // page only redirects users that DO have a recognized role.
  redirect('/portal/sign-in')
}
