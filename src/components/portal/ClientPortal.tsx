'use client'

import { useState, useSyncExternalStore } from 'react'
import { AlertsCard, BriefingsCard, NewsCard, TipsCard, WeatherCard } from './Cards'
import { ALL_SITES, alerts, alertsForSite, contact, me, sites, summaries, type SiteId, type ThreatLevel } from './data'
import { FeedbackSection, InvestigationsSection } from './Forms'
import { PortalHeader, SiteSelect } from './Header'
import { IntelMap } from './IntelMap'
import { Ticker } from './Ticker'

/** Design-review switches, set from the URL (see src/app/portal/page.tsx). */
export interface PortalPreview {
  noAlert?: boolean
  emptyAlerts?: boolean
  threat?: ThreatLevel
  formsSent?: boolean
}

const SITE_KEY = 'smg-portal-site'

// Last site this browser picked (moves to the user profile in Phase 3).
function readSavedSite(): SiteId | null {
  try {
    const v = localStorage.getItem(SITE_KEY)
    return v && (v === ALL_SITES || sites.some((s) => s.id === v)) ? v : null
  } catch {
    return null
  }
}
function subscribeStorage(cb: () => void) {
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function ClientPortal({ preview = {} }: { preview?: PortalPreview }) {
  const savedSite = useSyncExternalStore(subscribeStorage, readSavedSite, () => null)
  const [pickedSite, setPickedSite] = useState<SiteId | null>(null)
  const siteId = pickedSite ?? savedSite ?? sites[0].id

  function changeSite(id: SiteId) {
    setPickedSite(id)
    try {
      localStorage.setItem(SITE_KEY, id)
    } catch {}
  }

  const summary = summaries[siteId]
  const siteAlerts = preview.emptyAlerts ? [] : alertsForSite(siteId)
  const activeAlert = preview.noAlert ? null : alerts.find((a) => a.id === summary.activeAlertId) ?? null
  const threat = preview.threat ?? (preview.noAlert ? 'LOW' : summary.threatLevel)
  const site = sites.find((s) => s.id === siteId)
  const bannerSite = sites.find((s) => s.id === activeAlert?.siteId)
  const tz = site?.timeZone ?? sites[0].timeZone

  return (
    <div className="cp">
      <PortalHeader siteId={siteId} onSiteChange={changeSite} />
      <Ticker />

      {activeAlert && (
        <div className="cp-banner" role="region" aria-label="Active alert">
          <div className="cp-col cp-banner__row">
            <span className="cp-banner__tag">ACTIVE ALERT · {activeAlert.severity}</span>
            <span className="cp-banner__title">{activeAlert.title}</span>
            {activeAlert.distanceMi != null && bannerSite && (
              <span className="cp-banner__dist">
                {activeAlert.distanceMi} mi from {bannerSite.name}
              </span>
            )}
            <a className="cp-banner__link" href={activeAlert.url} target="_blank" rel="noopener noreferrer">
              View details →
            </a>
          </div>
        </div>
      )}

      <main className="cp-col cp-main">
        <div className="cp-greet">
          <div className="cp-greet__text">
            <span className="cp-greet__meta">
              {me.clientName} · {me.industry} · Updated {me.updatedAt}
            </span>
            {/* Time-of-day text can differ between server and browser render. */}
            <h1 suppressHydrationWarning>
              {greeting(tz)}, {me.firstName}
            </h1>
          </div>
          <div className="cp-status">
            <span className="cp-statchip" style={{ borderColor: `var(--sev-${threat.toLowerCase()})` }}>
              <i style={{ color: `var(--sev-${threat.toLowerCase()})` }} aria-hidden="true" />
              Threat level:
              <b style={{ color: `var(--sev-${threat.toLowerCase()})` }}>{threat}</b>
            </span>
            <span className="cp-statchip cp-statchip--count">
              <b>{siteAlerts.length}</b> alert{siteAlerts.length === 1 ? '' : 's'} near your sites
            </span>
          </div>
        </div>

        <div className="cp-mpicker">
          <label htmlFor="cp-site-mobile">Site</label>
          <SiteSelect id="cp-site-mobile" className="cp-input" value={siteId} onChange={changeSite} />
        </div>

        <div className="cp-dash">
          <IntelMap siteId={siteId} />
          <WeatherCard />
          <AlertsCard alerts={siteAlerts} />
          <NewsCard />
          <TipsCard />
          <BriefingsCard />
        </div>

        <InvestigationsSection forceSent={preview.formsSent} />
        <FeedbackSection siteId={siteId} forceSent={preview.formsSent} />
      </main>

      <footer className="cp-footer">
        <div className="cp-col cp-footer__row">
          <span>
            24/7 operations line: <b>{contact.phone}</b> · {contact.email}
          </span>
          <span className="cp-footer__right">
            <span>Data: NWS, CISA, OSIRIS layers</span>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </span>
        </div>
      </footer>

      <nav className="cp-tabbar" aria-label="Portal sections">
        <a href="#" aria-current="page">
          <span aria-hidden="true">⌂</span>Home
        </a>
        <a href="#">
          <span aria-hidden="true">⚠</span>Alerts
        </a>
        <a href="#">
          <span aria-hidden="true">◎</span>Map
        </a>
        <a href="#">
          <span aria-hidden="true">▤</span>Briefings
        </a>
      </nav>
    </div>
  )
}
