import type { WantedList } from '@/server/publicsafety'

const officeName = (slug: string) => slug.replace(/\b\w/g, (c) => c.toUpperCase())

// FBI Wanted notices for the portal's field office(s). The FBI gives no locations,
// so this is a list only, never map pins. Each entry links to the FBI's own notice.
export function WantedCard({ lists }: { lists: WantedList[] }) {
  if (lists.length === 0) return null
  return (
    <section id="fbi-wanted" tabIndex={-1} className="cp-card cp-wanted cp-anchor" aria-labelledby="cp-wanted-title">
      <div className="cp-card__head">
        <h2 id="cp-wanted-title" className="cp-card__title">
          FBI Wanted · {lists.map((l) => `${officeName(l.office)} Field Office`).join(', ')}
        </h2>
        <span className="cp-card__sub">
          Current FBI notices for your region. If you see one of these people, don&apos;t approach them: call 911 or
          1-800-CALL-FBI.
        </span>
      </div>
      {lists.every((l) => l.items.length === 0) ? (
        <div className="cp-empty">
          <span>No current FBI wanted notices for this field office.</span>
        </div>
      ) : (
        <ul className="cp-wanted__list">
          {lists.flatMap((l) =>
            l.items.map((w) => (
              <li key={w.uid}>
                <a className="cp-wanted__item" href={w.url} target="_blank" rel="noopener noreferrer">
                  {w.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote FBI image, shown as published
                    <img src={w.image} alt="" className="cp-wanted__photo" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="cp-wanted__photo" aria-hidden="true" />
                  )}
                  <span className="cp-wanted__body">
                    <span className="cp-wanted__name">{w.title}</span>
                    {w.subject && <span className="cp-meta">{w.subject}</span>}
                    {w.reward && <span className="cp-wanted__reward">{w.reward}</span>}
                  </span>
                </a>
              </li>
            )),
          )}
        </ul>
      )}
      <span className="cp-meta cp-wanted__source">
        Source: FBI ·{' '}
        {lists.map((l) => (
          <a key={l.office} href={`https://www.fbi.gov/contact-us/field-offices/${l.office}`} target="_blank" rel="noopener noreferrer">
            {officeName(l.office)} Field Office ({l.total})
          </a>
        ))}
      </span>
    </section>
  )
}
