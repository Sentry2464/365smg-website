'use client'

import { useEffect, useState } from 'react'

// The dashboard sections the header, mobile menu and tab bar link to. Only sections with
// real content are listed; briefings, podcasts and tips stay out until they're live.
export interface Section {
  id: string
  label: string
  short: string
  icon: string
}

const s = (id: string, label: string, short: string, icon: string): Section => ({ id, label, short, icon })

export const HOME = s('top', 'Home', 'Home', '⌂')
export const ALERTS = s('alerts', 'Alerts', 'Alerts', '⚠')
export const MAP = s('intel-map', 'Intel map', 'Map', '◎')
export const MISSING = s('missing-persons', 'Missing persons', 'Missing', '◉')
export const WANTED = s('fbi-wanted', 'FBI most wanted', 'Wanted', '★')
export const REGISTRY = s('sex-offenders', 'Sex offenders', 'Registry', '⚑')
export const INVESTIGATIONS = s('investigations', 'Investigations', 'Cases', '✎')
export const FEEDBACK = s('feedback', 'Feedback', 'Feedback', '✉')

export interface NavGroup {
  group: string
  items: Section[]
}
export type NavItem = Section | NavGroup

/** Header and menu: top-level links, with the public-safety cards grouped under one heading. */
export const NAV: NavItem[] = [
  HOME,
  ALERTS,
  MAP,
  { group: 'Public safety', items: [MISSING, WANTED, REGISTRY] },
  INVESTIGATIONS,
  FEEDBACK,
]

/** Sections that always render; the public-safety cards only when the client has them. */
export const ALWAYS = new Set([HOME.id, ALERTS.id, MAP.id, INVESTIGATIONS.id, FEEDBACK.id])

/** Scrolls to a section (the top of the page for Home) and moves focus there. */
export function goToSection(id: string) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const el = id === HOME.id ? null : document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  else window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
  history.replaceState(null, '', id === HOME.id ? location.pathname + location.search : `#${id}`)
  ;(el ?? document.getElementById('cp-main'))?.focus({ preventScroll: true })
}

const ALL_IDS = [ALERTS, MAP, MISSING, WANTED, REGISTRY, INVESTIGATIONS, FEEDBACK].map((x) => x.id)

/**
 * The section in view: of those whose top has passed a line 30% down the window, the one
 * nearest the line (on desktop the alerts card sits beside the map, so "last in page
 * order" would pick the wrong one).
 */
export function useActiveSection(): string {
  const [active, setActive] = useState<string>(HOME.id)
  useEffect(() => {
    const els = ALL_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    if (!els.length) return
    const update = () => {
      const line = window.innerHeight * 0.3
      let current = HOME.id
      let best = -Infinity
      for (const el of els) {
        const top = el.getBoundingClientRect().top
        if (top <= line && top > best) {
          best = top
          current = el.id
        }
      }
      // At the very bottom, the lowest section counts even if its top never reaches the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = els.reduce((a, b) => (b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a)).id
      }
      setActive(current)
    }
    // IntersectionObserver tells us when something crossed; the positions decide which one.
    const io = new IntersectionObserver(update, { rootMargin: '-30% 0px -60% 0px', threshold: [0, 1] })
    els.forEach((el) => io.observe(el))
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', update)
    }
  }, [])
  return active
}

/** A link to a section: smooth scroll instead of a jump, then `after` (e.g. close a menu). */
export function sectionLinkProps(section: Section, active: string, after?: () => void) {
  return {
    href: section.id === HOME.id ? '/portal' : `#${section.id}`,
    'aria-current': active === section.id ? ('location' as const) : undefined,
    onClick: (e: { preventDefault: () => void }) => {
      e.preventDefault()
      after?.()
      goToSection(section.id)
    },
  }
}
