import type { Metadata } from 'next'
import { Poppins, Montserrat } from 'next/font/google'
import './globals.css'

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
  openGraph: {
    title: 'Fox Mortgage | Your Mortgage, Monitored. Every Day.',
    description: 'Strategic Mortgage Monitoring for Ontario homeowners. Never miss a savings opportunity.',
    url: 'https://foxmortgage.ca',
    siteName: 'Fox Mortgage',
    locale: 'en_CA',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${montserrat.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}
