import { authMiddleware } from '@clerk/nextjs/server'

export default authMiddleware({
  publicRoutes: [
    '/',
    '/about',
    '/services',
    '/smm',
    '/contact',
    '/apply',
    '/private-lending',
    '/portal/sign-in',
    '/api/contact',
    '/api/smm-enroll',
    '/api/investor-inquiry',
    '/api/portal/add-referral',
  ]
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
