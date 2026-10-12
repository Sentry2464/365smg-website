import type { RegistryView } from '@/server/registry'

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })

// FDLE Sexual Offender and Predator registry near the client's sites. Only for clients
// an admin has opted in. Records are shown as FDLE publishes them, with FDLE's warnings
// verbatim. FDLE doesn't authorise links to its registry site, so it's named, not linked.
export function RegistryCard({ view }: { view: RegistryView | null }) {
  if (!view) return null
  return (
    <section className="cp-card cp-wanted" aria-labelledby="cp-registry-title">
      <div className="cp-card__head">
        <h2 id="cp-registry-title" className="cp-card__title">
          Registered sexual offenders and predators near your sites
        </h2>
        <span className="cp-card__sub">
          From the Florida Department of Law Enforcement (FDLE) public registry, within {view.radiusMi} mile
          {view.radiusMi === 1 ? '' : 's'} of your sites.{' '}
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
          <span>No registrants listed within this distance of your sites.</span>
        </div>
      ) : (
        <ul className="cp-registry__list">
          {view.people.map((p) => (
            <li key={p.id} className="cp-registry__item">
              <span className="cp-wanted__name">{p.name}</span>
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
            </li>
          ))}
        </ul>
      )}
      <span className="cp-meta cp-wanted__source">Source: FDLE Sexual Offender and Predator public data file.</span>
    </section>
  )
}
