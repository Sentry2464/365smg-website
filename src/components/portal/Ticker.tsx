'use client'

import { useState } from 'react'
import { ticker, type TickerItem } from './data'

function Item({ item, hidden }: { item: TickerItem; hidden?: boolean }) {
  return (
    <a
      className="cp-ticker__item"
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={hidden ? -1 : undefined}
    >
      <span className="cp-srcchip" style={{ color: item.color }}>
        {item.source}
      </span>
      <span>{item.title}</span>
      <span className="cp-ticker__age">{item.age}</span>
    </a>
  )
}

export function Ticker() {
  const [paused, setPaused] = useState(false)

  return (
    <section className={`cp-ticker${paused ? ' cp-ticker--paused' : ''}`} aria-label="Live threat intel headlines">
      <div className="cp-ticker__label">
        <i aria-hidden="true" />
        <span className="cp-ticker__full">LIVE THREAT INTEL</span>
        <span className="cp-ticker__short">LIVE</span>
      </div>
      <div className="cp-ticker__viewport">
        <div className="cp-ticker__track">
          {ticker.map((t) => (
            <Item key={t.url + t.title} item={t} />
          ))}
          {/* Second copy makes the -50% loop seamless; hidden from assistive tech. */}
          <div className="cp-ticker__dup" aria-hidden="true">
            {ticker.map((t) => (
              <Item key={'dup' + t.title} item={t} hidden />
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="cp-ticker__pause"
        aria-label={paused ? 'Play ticker' : 'Pause ticker'}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      <a className="cp-ticker__all" href="#">
        All news →
      </a>
    </section>
  )
}
