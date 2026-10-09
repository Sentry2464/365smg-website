'use client'

import { useEffect, useState } from 'react'
import { usePortal } from './context'
import { alertMeta, briefing, news, podcast, tips, weather, type Alert, type Site } from './data'

export function WeatherCard({ site }: { site?: Site }) {
  const city = site?.city ?? weather.city
  return (
    <section className="cp-card cp-area-weather" aria-labelledby="cp-wx-title">
      <div className="cp-card__head">
        <h2 id="cp-wx-title" className="cp-card__title">
          Weather · {city}
        </h2>
      </div>
      <div className="cp-wx">
        <span className="cp-wx__icon" aria-hidden="true">
          ⛅
        </span>
        <div>
          <span className="cp-wx__label cp-label">Weather · {city.split(',')[0]}</span>
          <div className="cp-wx__temp">
            {weather.tempF}°F
          </div>
          <div className="cp-wx__cond">
            {weather.conditions} · Wind {weather.windDir} {weather.windMph} mph
          </div>
        </div>
      </div>
      <div className="cp-wx__days">
        {weather.forecast.map((d) => (
          <div key={d.day} className="cp-wx__day">
            <span>{d.day}</span>
            <b>
              {d.hi}° / {d.lo}°
            </b>
          </div>
        ))}
      </div>
      <span className="cp-wx__src">Source: NWS api.weather.gov</span>
    </section>
  )
}

export function AlertsCard({ alerts }: { alerts: Alert[] }) {
  const { sites } = usePortal()
  return (
    <section className="cp-card cp-area-alerts" aria-labelledby="cp-alerts-title">
      <div className="cp-card__head">
        <h2 id="cp-alerts-title" className="cp-card__title">
          Alerts near your sites
        </h2>
      </div>
      {alerts.length === 0 ? (
        <div className="cp-empty">
          <b>✓ All clear</b>
          <span>No alerts near your sites in the last 24 hours.</span>
        </div>
      ) : (
        <ul className="cp-alerts">
          {alerts.map((a) => (
            <li key={a.id}>
              <a className="cp-alert" href={a.url} target="_blank" rel="noopener noreferrer">
                <span className={`cp-sev cp-sev--${a.severity}`}>{a.severity}</span>
                <span className="cp-alert__body">
                  <span className="cp-alert__title">{a.title}</span>
                  <span className="cp-meta">{alertMeta(a, sites)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <a className="cp-more" href="#">
        All alerts →
      </a>
    </section>
  )
}

export function NewsCard() {
  const { client } = usePortal()
  return (
    <section className="cp-card cp-area-news" aria-labelledby="cp-news-title">
      <div className="cp-card__head">
        <h2 id="cp-news-title" className="cp-card__title">
          News for {client.industryPlural}
        </h2>
        <span className="cp-card__sub">Filtered by your location and sector</span>
      </div>
      <div className="cp-news">
        {news.map((n) => (
          <a key={n.title} href={n.url} target="_blank" rel="noopener noreferrer">
            <span className="cp-thumb" aria-hidden="true">
              IMG
            </span>
            <span className="cp-news__body">
              <span className="cp-news__title">{n.title}</span>
              <span className="cp-meta">
                {n.outlet} · {n.age}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}

export function TipsCard() {
  return (
    <section className="cp-card cp-area-tips" aria-labelledby="cp-tips-title">
      <div className="cp-card__head">
        <h2 id="cp-tips-title" className="cp-card__title">
          Security tips
        </h2>
        <span className="cp-card__sub">Physical + cyber · CISA advisories for your sector</span>
      </div>
      <div className="cp-tip">
        <span className="cp-label">Tip of the week</span>
        <h3>{tips.tipOfWeek.title}</h3>
        <p className="cp-tip__long">{tips.tipOfWeek.body}</p>
        <p className="cp-tip__short">{tips.tipOfWeek.short}</p>
      </div>
      <div className="cp-adv">
        {tips.advisories.map((a) => (
          <a key={a.title} href={a.url} target="_blank" rel="noopener noreferrer">
            <span>{a.title}</span>
            <span className="cp-meta">{a.date}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

// Simulated playback until episodes have audio URLs; then drive this from an <audio> element.
function usePodcast() {
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(podcast.startSec)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setPos((p) => Math.min(podcast.durationSec, p + 1)), 1000)
    return () => clearInterval(t)
  }, [playing])
  return { playing, toggle: () => setPlaying((p) => !p), pos }
}

function PlayButton({ playing, toggle }: { playing: boolean; toggle: () => void }) {
  return (
    <button type="button" className="cp-play" aria-label={playing ? 'Pause episode' : 'Play episode'} onClick={toggle}>
      {playing ? '❚❚' : '▶'}
    </button>
  )
}

export function BriefingsCard() {
  const { playing, toggle, pos } = usePodcast()
  const pct = (pos / podcast.durationSec) * 100

  return (
    <section className="cp-card cp-area-brief" aria-labelledby="cp-brief-title">
      <div className="cp-card__head">
        <h2 id="cp-brief-title" className="cp-card__title">
          Briefings &amp; podcasts
        </h2>
      </div>
      <div className="cp-pod--desktop">
        <div className="cp-brief">
          <span className="cp-pdf" aria-hidden="true">
            PDF
          </span>
          <span className="cp-brief__body">
            <span className="cp-label cp-label--muted">
              Monthly intel brief
            </span>
            <span className="cp-brief__title">
              {briefing.month} · {briefing.area}
            </span>
            <a className="cp-more" href={briefing.url}>
              Read briefing →
            </a>
          </span>
        </div>
        <div className="cp-pod">
          <span className="cp-label cp-label--muted">
            Latest episode · 365 SMG podcast
          </span>
          <span className="cp-pod__title">{podcast.title}</span>
          <div className="cp-player">
            <PlayButton playing={playing} toggle={toggle} />
            <div
              className="cp-progress"
              role="progressbar"
              aria-label="Episode progress"
              aria-valuemin={0}
              aria-valuemax={podcast.durationSec}
              aria-valuenow={pos}
              aria-valuetext={`${fmt(pos)} of ${fmt(podcast.durationSec)}`}
            >
              <i style={{ width: `${pct}%` }} />
            </div>
            <span className="cp-pod__time">
              {fmt(pos)} / {fmt(podcast.durationSec)}
            </span>
          </div>
          <a className="cp-more cp-more--plain" href={podcast.url}>
            All episodes →
          </a>
        </div>
      </div>
      <div className="cp-pod--mobile">
        <PlayButton playing={playing} toggle={toggle} />
        <span className="cp-brief__body">
          <span className="cp-meta">LATEST PODCAST · {Math.floor(podcast.durationSec / 60)} MIN</span>
          <span className="cp-pod__title">{podcast.title}</span>
        </span>
      </div>
    </section>
  )
}
