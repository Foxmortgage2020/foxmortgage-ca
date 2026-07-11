import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata, Viewport } from 'next'
import { Poppins, Montserrat } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Fox Mortgage | Strategic Mortgage Monitoring | Ontario',
  description: 'Michael Fox, Mortgage Agent Level 2 at BRX Mortgage. Strategic Mortgage Monitoring for Ontario homeowners. Fergus, Guelph, Wellington County.',
  keywords: 'mortgage agent Ontario, mortgage monitoring, Fergus mortgage, Guelph mortgage, BRX Mortgage, Strategic Mortgage Monitoring',
  // Session 9 (PWA): the manifest, apple-touch icon, and standalone
  // web-app hints. The favicon is served from app/icon.png (Next
  // convention). Icons live in public/icons/ (generated on-brand).
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Fox Mortgage',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Fox Mortgage | Your Mortgage, Monitored. Every Day.',
    description: 'Strategic Mortgage Monitoring for Ontario homeowners. Never miss a savings opportunity.',
    url: 'https://foxmortgage.ca',
    siteName: 'Fox Mortgage',
    locale: 'en_CA',
    type: 'website',
  },
}

// Session 9: Next 14 splits themeColor + viewport out of metadata. Navy
// brand chrome on the installed app; standard device-width scaling.
export const viewport: Viewport = {
  themeColor: '#032133',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${montserrat.variable}`}>
      <body className="antialiased">
        <ServiceWorkerRegister />
        <ClerkProvider
          // Clerk v5: afterSignInUrl/afterSignUpUrl are deprecated.
          // Use *FallbackRedirectUrl so per-flow redirects (e.g. the
          // onboarding signup's explicit router.push to the hub, or
          // a redirect_url query param on the sign-in form) still
          // win. The fallback only kicks in when nothing more
          // specific is set.
          signInFallbackRedirectUrl="/portal"
          signUpFallbackRedirectUrl="/portal"
          signInUrl="/portal/sign-in"
          signUpUrl="/portal/sign-in"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
