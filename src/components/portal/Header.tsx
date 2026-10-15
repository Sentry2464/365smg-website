'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { signOut } from '@/app/portal/actions'
import { usePortal } from './context'
import { ALL_SITES, siteLabel, type SiteId } from './data'
import { NAV, sectionLinkProps, useActiveSection, type NavItem, type Section } from './sections'

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

/** Desktop "Public safety ▾": a disclosure menu (button + list of links). */
function NavGroup({ label, items, active }: { label: string; items: Section[]; active: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = `cp-nav-${label.toLowerCase().replace(/\W+/g, '-')}`

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent | FocusEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return
        setOpen(false)
        ref.current?.querySelector('button')?.focus()
      } else if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    document.addEventListener('focusin', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      document.removeEventListener('focusin', close)
    }
  }, [open])

  return (
    <div className="cp-navgroup" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        className={items.some((i) => i.id === active) ? 'cp-navgroup__btn cp-navgroup__btn--current' : 'cp-navgroup__btn'}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul id={id} className="cp-navgroup__list">
          {items.map((i) => (
            <li key={i.id}>
              <a {...sectionLinkProps(i, active, () => setOpen(false))}>{i.label}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The nav, keeping only the sections this client's dashboard actually shows. */
function useNav(available: Set<string>): NavItem[] {
  return NAV.flatMap((n): NavItem[] => {
    if (!('group' in n)) return available.has(n.id) ? [n] : []
    const items = n.items.filter((i) => available.has(i.id))
    return items.length ? [{ ...n, items }] : []
  })
}

export function PortalHeader({
  siteId,
  onSiteChange,
  available,
}: {
  siteId: SiteId
  onSiteChange: (id: SiteId) => void
  /** Section ids rendered on this dashboard; links to anything else are hidden. */
  available: Set<string>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const active = useActiveSection()
  const nav = useNav(available)
  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      <div className="cp-goldbar" />
      <header className="cp-header">
        <div className="cp-col cp-header__row">
          <a
            href="https://365securitymg.com"
            target="_blank"
            rel="noopener noreferrer"
            className="cp-brand"
            aria-label="365 Security Management Group website (opens in a new tab)"
          >
            <Image src="/portal/365smg-logo.png" alt="" width={336} height={315} priority />
            <span className="cp-brand__text">
              <span className="cp-brand__title">Client Portal</span>
              <span className="cp-brand__sub">365 Security Management Group</span>
            </span>
          </a>
          <nav className="cp-nav" aria-label="Portal">
            {nav.map((n) =>
              'group' in n ? (
                <NavGroup key={n.group} label={n.group} items={n.items} active={active} />
              ) : (
                <a key={n.id} {...sectionLinkProps(n, active)}>
                  {n.label}
                </a>
              ),
            )}
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
            {nav.map((n) =>
              'group' in n ? (
                <div key={n.group} className="cp-menu__group" role="group" aria-labelledby="cp-menu-group">
                  <span id="cp-menu-group" className="cp-menu__heading">
                    {n.group}
                  </span>
                  {n.items.map((i) => (
                    <a key={i.id} {...sectionLinkProps(i, active, closeMenu)}>
                      {i.label}
                    </a>
                  ))}
                </div>
              ) : (
                <a key={n.id} {...sectionLinkProps(n, active, closeMenu)}>
                  {n.label}
                </a>
              ),
            )}
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
