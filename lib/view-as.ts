// View-as write protection (Session 8). One pure rule, used by every
// partner-portal write route: a request carrying an active view-as
// (impersonation) context never writes. This is the server half of the
// belt-and-suspenders contract — the component half removes or disables
// write controls when the view-as banner is up.
//
// Pure and dependency-free so tests/view-as.test.ts can assert the
// rejection without Next.js or Clerk in the room. The error code and copy
// are a UX contract with the portal client pages (they branch on
// error === 'ImpersonationReadOnly'); do not change them casually.

export interface ViewAsRejection {
  status: 403
  body: { error: 'ImpersonationReadOnly'; message: string }
}

export const VIEW_AS_REJECTION_MESSAGE =
  'This action is blocked because you are viewing this portal in impersonation mode. Exit impersonation to take admin actions.'

// Truthiness is the contract: getPortalContext() returns
// impersonation === null when no view-as is active (including when a
// non-admin somehow carries the cookie — lib/auth.ts already refuses to
// honor it). Anything non-null means the request is a view-as request.
export function viewAsWriteRejection(impersonation: unknown): ViewAsRejection | null {
  if (!impersonation) return null
  return {
    status: 403,
    body: { error: 'ImpersonationReadOnly', message: VIEW_AS_REJECTION_MESSAGE },
  }
}
