'use client'

import { useEffect, useRef } from 'react'
import type { RegistrantDetails, RegistryView } from '@/server/registry'
import { REGISTRY_OPEN, registryEntryId, registryMark } from './registryMark'

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })

// FDLE Sexual Offender and Predator registry near the client's sites. Only for clients
// an admin has opted in. Records are shown as FDLE publishes them, with FDLE's warnings
// verbatim. FDLE doesn't authorise links to its registry site, so it's named, not linked.
export function RegistryCard({ view }: { view: RegistryView | null }) {
  const list = useRef<HTMLUListElement>(null)

  // A Registry pin clicked on the intel map: open that entry's details and bring it into view.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const n = (e as CustomEvent<number>).detail
      const item = list.current?.querySelector<HTMLLIElement>(`#${registryEntryId(n)}`)
      if (!item) return
      const details = item.querySelector('details')
      if (details) details.open = true
      item.scrollIntoView({ behavior: 'smooth', block: 'center' })
      item.focus({ preventScroll: true })
    }
    window.addEventListener(REGISTRY_OPEN, onOpen)
    return () => window.removeEventListener(REGISTRY_OPEN, onOpen)
  }, [])

  if (!view) return null
  return (
    <section id="sex-offenders" tabIndex={-1} className="cp-card cp-wanted cp-anchor" aria-labelledby="cp-registry-title">
      <div className="cp-card__head">
        <h2 id="cp-registry-title" className="cp-card__title">
          Registered sexual offenders and predators near your sites
        </h2>
        <span className="cp-card__sub">
          From the Florida Department of Law Enforcement (FDLE) public registry,{' '}
          {view.expanded
            ? `none within ${view.radiusMi} mi of your sites; the nearest within ${view.maxRadiusMi} mi are shown.`
            : `within ${view.radiusMi} mi of your sites.`}{' '}
          {view.asOf ? `As of ${fmt(view.asOf)}.` : 'The registry file has not been downloaded yet.'}
        </span>
      </div>
      <div className="cp-registry__warn" role="note">
        <p>
          <b>FDLE advises:</b> “Positive identification cannot be made without a fingerprint comparison.”
        </p>
        <p>
          “This information is provided as a service for the public&apos;s benefit and may not be used in the
          perpetration of any criminal act or harassment against these individuals.”
        </p>
        <p>
          Note: this list may not reflect the current residence, status or other information regarding a
          registrant. To verify, search FDLE&apos;s Sexual Offender and Predator registry at offender.fdle.state.fl.us or
          call FDLE at 1-888-357-7332.
        </p>
      </div>
      {view.asOf && view.people.length === 0 ? (
        <div className="cp-empty">
          <span>No registrants listed within {view.maxRadiusMi} mi of your sites.</span>
        </div>
      ) : (
        <ul className="cp-registry__list" ref={list}>
          {view.people.map((p, i) => (
            <li key={p.id} id={registryEntryId(i + 1)} tabIndex={-1} className="cp-registry__item">
              <span className="cp-wanted__name">
                <span className="cp-registry__mark" title="Its number on the intel map’s Registry pins">
                  {registryMark(i + 1)}
                </span>{' '}
                {p.name}
              </span>
              <span className="cp-meta">
                {p.subjectType} · {p.status}
              </span>
              <span className="cp-meta">
                {p.addressType} address{p.status.toLowerCase().startsWith('absconded') ? ' (last known)' : ''}:{' '}
                {p.address}
              </span>
              <span className="cp-meta">
                {p.distanceMi} mi from {p.siteName}
              </span>
              <Details d={p.details} />
            </li>
          ))}
        </ul>
      )}
      <span className="cp-meta cp-wanted__source">Source: FDLE Sexual Offender and Predator public data file.</span>
    </section>
  )
}

/** FDLE's published description, as in the data file. FDLE's photos are not shown. */
function Details({ d }: { d: RegistrantDetails }) {
  const rows: [string, string][] = [
    ['Sex', d.sex],
    ['Race', d.race],
    ['Height', d.height],
    ['Weight', d.weight],
    ['Hair', d.hair],
    ['Eyes', d.eyes],
    ['Birth date', d.birthDate],
    ['Victim was a minor', d.victimMinor],
    ['FL Dept. of Corrections number', d.dcNumber],
  ]
  const shown = rows.filter(([, v]) => v)
  return (
    <details className="cp-registry__details">
      <summary>Details</summary>
      {shown.length > 0 && (
        <dl className="cp-registry__facts">
          {shown.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {d.addresses.length > 0 && (
        <ul className="cp-registry__addresses">
          {d.addresses.map((a) => (
            <li key={a.type}>
              <b>{a.type}:</b> {a.address}
              {a.added && <span className="cp-meta"> · added {a.added}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="cp-meta">As published in FDLE&apos;s public data file. Verify with FDLE before acting on it.</p>
    </details>
  )
}
