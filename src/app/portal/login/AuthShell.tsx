import type { ReactNode } from 'react'
import Image from 'next/image'
import { contact } from '@/components/portal/data'

export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="cp cp-auth">
      <div className="cp-goldbar" />
      <header className="cp-header">
        <div className="cp-col cp-header__row">
          <span className="cp-brand">
            <Image src="/portal/365smg-logo.png" alt="" width={336} height={315} priority />
            <span className="cp-brand__text">
              <span className="cp-brand__title">Client Portal</span>
              <span className="cp-brand__sub">365 Security Management Group</span>
            </span>
          </span>
        </div>
      </header>
      <main className="cp-auth__main">
        <section className="cp-card cp-auth__card" aria-labelledby="cp-auth-title">
          <div className="cp-card__head">
            <h1 id="cp-auth-title" className="cp-card__title cp-auth__title">
              {title}
            </h1>
          </div>
          {intro && <div className="cp-auth__intro">{intro}</div>}
          {children}
        </section>
        <p className="cp-auth__help">
          Need help signing in? Call the 24/7 operations line: <b>{contact.phone}</b>
        </p>
      </main>
    </div>
  )
}
