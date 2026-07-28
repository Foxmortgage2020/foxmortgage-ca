import { authMiddleware } from '@clerk/nextjs/server'

// NOTE: Disable email OTP verification in Clerk dashboard →
// Configure → Email, Phone, Username → Email verification: off

export default authMiddleware({
  publicRoutes: [
    // Phase B1: the bridge sweep's machine path (n8n schedule) enforces its
    // own x-bridge-secret; Clerk would 401 it before the handler runs.
    '/api/portal/admin/underwriting/sweep',
    '/',
    '/about',
    '/services',
    '/smm',
    '/smm/enroll',
    '/contact',
    '/apply',
    '/private-lending',
    '/private-lending/apply',
    '/penalty',
    '/refinance',
    '/tools',
    '/tools/(.*)',
    '/portal/sign-in',
    '/portal/sign-in/(.*)',
    // Session 9 (PWA): the offline fallback page the service worker serves
    // when a navigation fails. Extensionless, so the matcher does not
    // auto-exempt it; it holds no data and must render without auth.
    '/offline',
    // Public demo FP portal (Build B lead-gen): sandboxed, read-only sample
    // pages under /demo. No auth — this is the destination outreach links point
    // to so a planner can preview the portal before signing anything.
    '/demo/(.*)',
    // Magic-link onboarding consumer routes — the token IS the auth.
    // /onboard/investor/hub stays Clerk-gated (only signed-in
    // investors should reach it).
    '/onboard/investor/(.*)',
    // Partner magic-link onboarding (realtor, lawyer, mortgage agent,
    // financial planner). Same model as investor: the (partnerId, token) in
    // the URL is the auth, and the welcome page plus /api/onboard/partner/signup
    // verify it. Must be Clerk-public so an unauthenticated invitee can reach it
    // before they have an account. Without this they hit the sign-in wall.
    '/onboard/partner/(.*)',
    '/onboard/expired',
    // The client's own status page (B5). Same model as the onboard routes
    // above: the token IS the auth, and it must be reachable by a client who
    // has no account and never will. The page validates the token itself
    // (opaque, 256-bit, stored hashed) and renders one identical not-found
    // page for anything that does not resolve. The token is deliberately hex:
    // the matcher below skips any path ending in `.<word>`, so a token with a
    // dot in it would route around this middleware entirely.
    '/portal/file/(.*)',
    // The native booking engine (session one). /book/<host>/<event-type> is a
    // public page a client reaches from a link in an email or a page on the
    // site, so it must be reachable without an account. Both the bare path and
    // the wildcard are listed because a wildcard entry does NOT cover its own
    // bare path. Host and event slugs are validated `^[a-z0-9][a-z0-9-]*$`, so
    // they are dot-free by construction and cannot route around this matcher.
    '/book',
    '/book/(.*)',
    '/api/contact',
    '/api/smm-enroll',
    // The homepage "Start Monitoring" CTA posts here. Without this entry
    // Clerk 401s the request before the handler runs and the CTA breaks again
    // in a way that looks nothing like the cause.
    '/api/smm-interest',
    '/api/investor-inquiry',
    '/api/portal/add-referral',
    '/api/onboard/signup',
    '/api/onboard/partner/signup',
    '/api/onboard/request-new-link',
    '/api/onboard/lead-capture',
    // Booking engine endpoints. Listed literally, one line each, because every
    // public API path in this list is literal and a Clerk 401 here would arrive
    // with a null body before the handler ever runs.
    '/api/book/slots',
    '/api/book/confirm',
    // Session two. The manage routes are authorised by the reschedule token
    // itself, the same model as the client status page, so Clerk must not gate
    // them. The cron route enforces its own x-bridge-secret, the underwriting
    // sweep precedent.
    '/api/book/manage/slots',
    '/api/book/manage/reschedule',
    '/api/book/manage/cancel',
    '/api/book/cron',
    // Bookkeeping service-account routes (FOX-112): the handlers enforce
    // their own Bearer auth via BOOKKEEPING_WEBHOOK_SECRET. They must be
    // exempt from Clerk middleware so the Bearer check can run — Clerk
    // doesn't understand service-account Bearer tokens and would 401
    // before the handler executes.
    '/api/bookkeeping/rules',
    '/api/bookkeeping/dry-run-log',
  ],
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
