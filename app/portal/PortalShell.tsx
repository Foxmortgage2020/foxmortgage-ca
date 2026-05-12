// Server component that reads SSR-available portal context (Clerk user +
// impersonation cookie) and passes the impersonation state as a serializable
// prop into the client layout. This is the bridge that lets the client
// layout know whether an admin is currently impersonating a partner —
// the impersonation cookie is httpOnly and unreachable from the client.

import { getPortalContext } from '@/lib/auth'
import PortalLayoutClient from './PortalLayoutClient'

export default async function PortalShell({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getPortalContext()
  const impersonation = ctx?.impersonation ?? null
  return (
    <PortalLayoutClient impersonation={impersonation}>
      {children}
    </PortalLayoutClient>
  )
}
