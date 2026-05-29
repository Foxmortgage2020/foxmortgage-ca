'use client'

// Surfaces the active impersonation (an admin "viewing as" a partner) to
// client portal pages. The `fox_impersonation` cookie is httpOnly and
// unreadable from the browser, so PortalShell reads it server-side via
// getPortalContext and feeds it through PortalLayoutClient into this
// provider. Pages can then greet the *impersonated* partner by name instead
// of showing the signed-in admin's name.
//
// Type-only import of ImpersonationContext is erased at build time, so this
// client module never pulls lib/auth's server-only runtime into the bundle
// (PortalLayoutClient relies on the same trick).

import { createContext, useContext } from 'react'
import type { ImpersonationContext } from '@/lib/auth'

const PortalImpersonationContext = createContext<ImpersonationContext | null>(null)

export function PortalImpersonationProvider({
  value,
  children,
}: {
  value: ImpersonationContext | null
  children: React.ReactNode
}) {
  return (
    <PortalImpersonationContext.Provider value={value}>
      {children}
    </PortalImpersonationContext.Provider>
  )
}

/** The raw impersonation context for the current view, or null when the
 *  viewer is a real partner (or an admin not impersonating). */
export function usePortalImpersonation(): ImpersonationContext | null {
  return useContext(PortalImpersonationContext)
}

/**
 * First name to greet on a portal page. When an admin is impersonating a
 * partner, greet that partner (from the read-only impersonation cookie);
 * otherwise fall back to the signed-in user's own first name, then 'there'.
 */
export function useGreetingFirstName(ownFirstName: string | null | undefined): string {
  const impersonation = useContext(PortalImpersonationContext)
  if (impersonation?.partnerName) {
    const first = impersonation.partnerName.trim().split(/\s+/)[0]
    if (first) return first
  }
  return ownFirstName || 'there'
}
