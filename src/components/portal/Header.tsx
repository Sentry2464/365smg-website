'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ALL_SITES, sites, siteLabel, me, type SiteId } from './data'

const navItems = ['Home', 'Alerts', 'Intel map', 'Briefings', 'Podcasts', 'Security tips', 'Investigations']

export function SiteSelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: SiteId
  onChange: (id: SiteId) => void
  className?: string
}) {
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {siteLabel(s.id)}
        </option>
      ))}
      <option value={ALL_SITES}>{siteLabel(ALL_SITES)}</option>
    </select>
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
            <div className="cp-avatar" role="img" aria-label={`Account: ${me.firstName}`}>
              {me.initials}
            </div>
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
          </nav>
        )}
      </header>
    </>
  )
}
