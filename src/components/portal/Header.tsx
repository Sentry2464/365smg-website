'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { signOut } from '@/app/portal/actions'
import { usePortal } from './context'
import { ALL_SITES, siteLabel, type SiteId } from './data'

const navItems = ['Home', 'Alerts', 'Intel map', 'Briefings', 'Podcasts', 'Security tips', 'Investigations']

export function SiteSelect({
  id,
  value,
  onChange,
  className,
  includeAll = true,
}: {
  id: string
  value: SiteId
  onChange: (id: SiteId) => void
  className?: string
  includeAll?: boolean
}) {
  const { sites } = usePortal()
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {siteLabel(s.id, sites)}
        </option>
      ))}
      {includeAll && sites.length > 1 && <option value={ALL_SITES}>{siteLabel(ALL_SITES, sites)}</option>}
    </select>
  )
}

function AccountMenu() {
  const { user } = usePortal()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="cp-account" ref={ref}>
      <button
        type="button"
        className="cp-avatar"
        aria-label={`Account: ${user.name}`}
        aria-expanded={open}
        aria-controls="cp-account-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {user.initials}
      </button>
      {open && (
        <div id="cp-account-menu" className="cp-account__menu">
          <b>{user.name}</b>
          <span>{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="cp-btn cp-btn--ghost">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export function PortalHeader({ siteId, onSiteChange }: { siteId: SiteId; onSiteChange: (id: SiteId) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <div className="cp-goldbar" />
      <header className="cp-header">
        <div className="cp-col cp-header__row">
          <Link href="/portal" className="cp-brand" aria-label="365 SMG Client Portal home">
            <Image src="/portal/365smg-logo.png" alt="" width={336} height={315} priority />
            <span className="cp-brand__text">
              <span className="cp-brand__title">Client Portal</span>
              <span className="cp-brand__sub">365 Security Management Group</span>
            </span>
          </Link>
          <nav className="cp-nav" aria-label="Portal">
            {navItems.map((label, i) => (
              <a key={label} href="#" aria-current={i === 0 ? 'page' : undefined}>
                {label}
              </a>
            ))}
          </nav>
          <div className="cp-header__right">
            <div className="cp-picker">
              <label htmlFor="cp-site-header">Site</label>
              <SiteSelect id="cp-site-header" value={siteId} onChange={onSiteChange} />
            </div>
            <AccountMenu />
          </div>
          <button
            type="button"
            className="cp-menubtn"
            aria-expanded={menuOpen}
            aria-controls="cp-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
        {menuOpen && (
          <nav id="cp-menu" className="cp-menu" aria-label="Portal">
            {navItems.map((label, i) => (
              <a key={label} href="#" aria-current={i === 0 ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
            <form action={signOut}>
              <button type="submit" className="cp-menu__signout">
                Sign out
              </button>
            </form>
          </nav>
        )}
      </header>
    </>
  )
}
