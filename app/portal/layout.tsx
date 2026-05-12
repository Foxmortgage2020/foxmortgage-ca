// Thin Next.js layout wrapper. The actual layout work lives in:
//   - PortalShell (server component — reads getPortalContext)
//   - PortalLayoutClient (client component — sidebar, header, banners,
//     portal switcher, partner picker)
//
// Splitting it this way lets the client layout see the impersonation
// state, which is stored in an httpOnly cookie unreadable from the
// browser.

import PortalShell from './PortalShell'

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PortalShell>{children}</PortalShell>
}
