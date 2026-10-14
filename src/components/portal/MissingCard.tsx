import type { MissingList } from '@/server/fdle'

const FDLE_SIGNUP = 'https://member.everbridge.net/892807736727806/new'
const FDLE_PAGE = 'https://www.fdle.state.fl.us/mcicsearch/AllCurrentAlerts.asp'

// FDLE's current AMBER, Missing Child, Spectrum, Purple and Silver alerts for Central
// Florida. Names, dates and cities only; each links to FDLE's own flyer.
export function MissingCard({ list }: { list: MissingList | null }) {
  if (!list) return null
  return (
    <section id="missing-persons" tabIndex={-1} className="cp-card cp-wanted cp-anchor" aria-labelledby="cp-missing-title">
      <div className="cp-card__head">
        <h2 id="cp-missing-title" className="cp-card__title">
          Missing persons alerts · Florida
        </h2>
        <span className="cp-card__sub">
          Current FDLE alerts for Central Florida (AMBER Alerts statewide). If you have information, call 911 or
          1-888-356-4774.
        </span>
      </div>
      {list.alerts.length === 0 ? (
        <div className="cp-empty">
          <span>No current FDLE alerts for this area.</span>
        </div>
      ) : (
        <ul className="cp-wanted__list">
          {list.alerts.slice(0, 12).map((a) => (
            <li key={a.id}>
              <a className="cp-wanted__item" href={a.url} target="_blank" rel="noopener noreferrer">
                <span className="cp-wanted__body">
                  <span className="cp-sev cp-sev--HIGH cp-missing__type">{a.type}</span>
                  <span className="cp-wanted__name">{a.name}</span>
                  <span className="cp-meta">
                    Missing from {a.from} since {a.since}
                    {a.category ? ` · ${a.category}` : ''}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <span className="cp-meta cp-wanted__source">
        Source: FDLE Missing Endangered Persons Information Clearinghouse ·{' '}
        <a href={FDLE_PAGE} target="_blank" rel="noopener noreferrer">
          All current alerts
        </a>{' '}
        ·{' '}
        <a href={FDLE_SIGNUP} target="_blank" rel="noopener noreferrer">
          Get FDLE alerts by text or email
        </a>
      </span>
    </section>
  )
}
