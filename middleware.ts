import { authMiddleware } from '@clerk/nextjs/server'

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
    '/portal/sign-in(.*)',
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
