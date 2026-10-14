'use client'

import { useEffect, useState } from 'react'

// The dashboard sections the header, mobile menu and tab bar link to. Only sections with
// real content are listed; briefings, podcasts and tips stay out until they're live.
export const SECTIONS = [
  { id: 'top', label: 'Home', short: 'Home', icon: '⌂' },
  { id: 'alerts', label: 'Alerts', short: 'Alerts', icon: '⚠' },
  { id: 'intel-map', label: 'Intel map', short: 'Map', icon: '◎' },
  { id: 'investigations', label: 'Investigations', short: 'Cases', icon: '✎' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

/** Scrolls to a section (the top of the page for Home) and moves focus there. */
export function goToSection(id: SectionId) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const el = id === 'top' ? null : document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  else window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
  history.replaceState(null, '', id === 'top' ? location.pathname + location.search : `#${id}`)
  ;(el ?? document.getElementById('cp-main'))?.focus({ preventScroll: true })
}

/**
 * The section in view: of those whose top has passed a line 30% down the window, the one
 * nearest the line (on desktop the alerts card sits beside the map, so "last in page
 * order" would pick the wrong one).
 */
export function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>('top')
  useEffect(() => {
    const els = SECTIONS.slice(1)
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el)
    if (!els.length) return
    const update = () => {
      const line = window.innerHeight * 0.3
      let current: SectionId = 'top'
      let best = -Infinity
      for (const el of els) {
        const top = el.getBoundingClientRect().top
        if (top <= line && top > best) {
          best = top
          current = el.id as SectionId
        }
      }
      // At the very bottom, the last section counts even if its top never reaches the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = els.at(-1)!.id as SectionId
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
