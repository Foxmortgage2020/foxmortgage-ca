// The FOXCA operator secret, in one place (2026-07-18 hardening). Every FOXCA
// store that calls an admin-side security-definer function threads this into the
// rpc so a direct call with the public anon key is refused (42501). It is the
// SAME secret client-links (B7-P) and client-presentation (B8b) use — no new
// env. Throw-if-unset (the SESSION_SECRET discipline): a misconfigured deploy
// fails loud rather than silently sending an empty secret.
//
// Server-only. Never NEXT_PUBLIC.
export function foxcaOperatorSecret(): string {
  const s = process.env.FOXCA_OPERATOR_SECRET
  if (!s) {
    throw new Error('FOXCA_OPERATOR_SECRET is not set. Add it to .env.local and Vercel (all targets).')
  }
  return s
}
