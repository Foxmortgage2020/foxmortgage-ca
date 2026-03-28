import { authMiddleware } from '@clerk/nextjs/server'

// NOTE: Disable email OTP verification in Clerk dashboard →
// Configure → Email, Phone, Username → Email verification: off

export default authMiddleware({
  // Public pages that don't require auth
  publicRoutes: [
    '/',
    '/about',
    '/services',
    '/smm',
    '/contact',
    '/apply',
    '/private-lending',
    '/portal/sign-in',
    '/portal/sign-in/(.*)',
    '/api/contact',
    '/api/smm-enroll',
    '/api/investor-inquiry',
    '/api/portal/add-referral',
  ],
  // Routes that Clerk should completely ignore (no auth check at all)
  ignoredRoutes: [
    '/((?!portal).*)',
  ],
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
