import type { Metadata } from 'next'
import './portal.css'

export const metadata: Metadata = {
  title: 'Client Portal | 365 Security Management Group',
  description: 'Security intelligence, alerts and briefings for 365 SMG clients.',
  robots: { index: false, follow: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children
}
