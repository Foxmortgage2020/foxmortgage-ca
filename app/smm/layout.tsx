import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Strategic Mortgage Monitoring | Fox Mortgage — Free for Ontario Homeowners',
  description:
    'Free mortgage monitoring for Ontario homeowners. Michael Fox, Mortgage Agent, Level 2, watches your rate and renewal window and sends you a monthly homeownership report. Enroll free at foxmortgage.ca/smm.',
}

export default function SMMLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
