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
    '/penalty',
    '/portal/sign-in',
    '/portal/sign-in/(.*)',
    '/api/contact',
    '/api/smm-enroll',
    '/api/investor-inquiry',
    '/api/portal/add-referral',
  ],
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
