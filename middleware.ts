import { authMiddleware } from '@clerk/nextjs/server'

// NOTE: Disable email OTP verification in Clerk dashboard →
// Configure → Email, Phone, Username → Email verification: off

export default authMiddleware({
  publicRoutes: [
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
    '/portal/sign-in',
    '/portal/sign-in/(.*)',
    // Magic-link onboarding consumer routes — the token IS the auth.
    // /onboard/investor/hub stays Clerk-gated (only signed-in
    // investors should reach it).
    '/onboard/investor/(.*)',
    '/onboard/expired',
    '/api/contact',
    '/api/smm-enroll',
    '/api/investor-inquiry',
    '/api/portal/add-referral',
    '/api/onboard/signup',
    '/api/onboard/request-new-link',
    '/api/onboard/lead-capture',
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
