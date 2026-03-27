import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Private Lending | Fox Mortgage — Ontario Private Mortgage Investing',
  description: 'Earn 9–14% secured returns on Ontario real estate. Deploy capital into first and second position private mortgages backed by registered charges. Learn how private lending works.',
}

export default function PrivateLendingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
