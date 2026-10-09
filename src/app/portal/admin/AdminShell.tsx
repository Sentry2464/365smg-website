import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Role } from '@/server/store'
import { signOut } from '../actions'

const links: { href: string; label: string; roles: Role[] }[] = [
  { href: '/portal/admin', label: 'Clients', roles: ['admin'] },
  { href: '/portal/admin/feedback', label: 'Feedback', roles: ['admin'] },
  { href: '/portal/admin/investigations', label: 'Investigations', roles: ['investigator'] },
  { href: '/portal/admin/audit', label: 'Audit log', roles: ['admin'] },
]

export function AdminShell({
  role,
  name,
  current,
  title,
  children,
}: {
  role: Role
  name: string
  current: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="cp cp-admin">
      <div className="cp-goldbar" />
      <header className="cp-header">
        <div className="cp-col cp-header__row cp-admin__header">
          <Link href="/portal/admin" className="cp-brand" aria-label="Portal admin home">
            <Image src="/portal/365smg-logo.png" alt="" width={336} height={315} priority />
            <span className="cp-brand__text">
              <span className="cp-brand__title">Portal admin</span>
              <span className="cp-brand__sub">365 SMG staff</span>
            </span>
          </Link>
          <nav className="cp-admin__nav" aria-label="Admin">
            {links
              .filter((l) => l.roles.includes(role))
              .map((l) => (
                <Link key={l.href} href={l.href} aria-current={l.href === current ? 'page' : undefined}>
                  {l.label}
                </Link>
              ))}
          </nav>
          <form action={signOut} className="cp-admin__signout">
            <span>{name}</span>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main className="cp-col cp-main">
        <h1 className="cp-admin__title">{title}</h1>
        {children}
      </main>
    </div>
  )
}

export const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York',
      })
    : '—'
