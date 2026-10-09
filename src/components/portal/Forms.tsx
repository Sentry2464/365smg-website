'use client'

import { useState, type FormEvent } from 'react'
import { submitFeedback, submitInvestigation } from './api'
import { contact, feedbackTopics, investigationTags, investigationTypes, type SiteId } from './data'
import { SiteSelect } from './Header'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function InvestigationsSection({ forceSent }: { forceSent?: boolean }) {
  const [status, setStatus] = useState<Status>(forceSent ? 'sent' : 'idle')
  const [caseRef, setCaseRef] = useState(forceSent ? 'INV-2026-0142' : '')
  const [errors, setErrors] = useState<{ description?: string }>({})

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const description = String(f.get('description') ?? '').trim()
    if (!description) {
      setErrors({ description: 'Add a short description so an investigator knows where to start.' })
      return
    }
    setErrors({})
    setStatus('sending')
    try {
      const res = await submitInvestigation({
        type: String(f.get('type')),
        timeline: f.get('timeline') === 'urgent' ? 'urgent' : 'standard',
        location: String(f.get('location') ?? ''),
        description,
        contactMethod: f.get('contact') === 'email' ? 'email' : 'phone',
      })
      setCaseRef(res.caseRef)
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className="cp-formcard" aria-labelledby="cp-inv-title">
      <div className="cp-formcard__intro">
        <span className="cp-label">365 SMG Investigations</span>
        <h2 id="cp-inv-title">Private &amp; Corporate Investigations</h2>
        <p className="cp-mobile-hide">
          Our licensed investigations department takes cases for communities, businesses and individuals. Requests go
          to a licensed investigator, not your site team, and are kept confidential.
        </p>
        <p className="cp-only-mobile">Confidential requests go straight to a licensed investigator.</p>
        <div className="cp-tags cp-mobile-hide">
          {investigationTags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <span className="cp-license cp-mobile-hide">
          Licensed Florida private investigative agency · Lic. {contact.piLicense}
        </span>
      </div>

      {status === 'sent' ? (
        <div className="cp-success" role="status">
          <b>✓ Request received</b>
          <p>A licensed investigator will contact you within 1 business day.</p>
          <span className="cp-meta">CASE REF · {caseRef}</span>
        </div>
      ) : (
        <form className="cp-form" onSubmit={onSubmit} noValidate>
          <div className="cp-form__pair">
            <div className="cp-field">
              <label htmlFor="cp-inv-type">Type of investigation</label>
              <select id="cp-inv-type" name="type" className="cp-input" required>
                {investigationTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="cp-field cp-mobile-hide">
              <label htmlFor="cp-inv-timeline">Timeline</label>
              <select id="cp-inv-timeline" name="timeline" className="cp-input">
                <option value="standard">Standard</option>
                <option value="urgent">Time-sensitive (within 72 hours)</option>
              </select>
            </div>
          </div>
          <div className="cp-field cp-mobile-hide">
            <label htmlFor="cp-inv-location">Location or address involved</label>
            <input id="cp-inv-location" name="location" className="cp-input" placeholder="e.g. Royal Cypress Preserve clubhouse" />
          </div>
          <div className="cp-field">
            <label htmlFor="cp-inv-desc">Brief description</label>
            <textarea
              id="cp-inv-desc"
              name="description"
              rows={3}
              className="cp-input"
              placeholder="What happened and what you need to find out"
              required
              aria-invalid={errors.description ? true : undefined}
              aria-describedby="cp-inv-desc-help"
            />
            {errors.description ? (
              <span id="cp-inv-desc-help" className="cp-error">
                {errors.description}
              </span>
            ) : (
              <span id="cp-inv-desc-help" className="cp-help">
                Keep it brief. An investigator will collect names and sensitive details by phone.
              </span>
            )}
          </div>
          <div className="cp-form__foot">
            <fieldset className="cp-radios cp-mobile-hide">
              <span>Contact me by</span>
              <label className="cp-check">
                <input type="radio" name="contact" value="phone" defaultChecked />
                Phone
              </label>
              <label className="cp-check">
                <input type="radio" name="contact" value="email" />
                Email
              </label>
            </fieldset>
            <button type="submit" className="cp-btn cp-btn--navy" disabled={status === 'sending'}>
              <span aria-hidden="true">🔒</span>
              {status === 'sending' ? 'Sending…' : 'Request confidential consultation'}
            </button>
          </div>
          {status === 'error' && (
            <span className="cp-error" role="alert">
              We couldn&apos;t send your request. Check your connection and try again, or call {contact.phone}.
            </span>
          )}
          <span className="cp-meta cp-only-mobile">Licensed FL agency · Lic. {contact.piLicense}</span>
        </form>
      )}
    </section>
  )
}

export function FeedbackSection({ siteId, forceSent }: { siteId: SiteId; forceSent?: boolean }) {
  const [status, setStatus] = useState<Status>(forceSent ? 'sent' : 'idle')
  const [replyBy, setReplyBy] = useState(forceSent ? 'Tuesday, October 13' : '')
  const [error, setError] = useState('')
  const [formSite, setFormSite] = useState<SiteId | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const message = String(f.get('message') ?? '').trim()
    if (!message) {
      setError('Write a short message so your account team knows how to help.')
      return
    }
    setError('')
    setStatus('sending')
    try {
      const res = await submitFeedback(
        {
          topic: String(f.get('topic')),
          siteId: formSite ?? siteId,
          message,
          callBack: f.get('callback') === 'on',
        },
        contact.replyBusinessDays,
      )
      setReplyBy(res.replyBy)
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className="cp-formcard" aria-labelledby="cp-fb-title">
      <div className="cp-formcard__intro">
        <h2 id="cp-fb-title">How can we serve you better?</h2>
        <p className="cp-mobile-hide">
          Share a comment, concern or request about your security service. Your account manager reviews every message
          and replies within {contact.replyBusinessDays} business days.
        </p>
        <p className="cp-only-mobile">
          Comments, concerns or requests about your security service go straight to your account team.
        </p>
        <p className="cp-urgent cp-urgent--desktop">
          Urgent or safety issue? Call the 24/7 operations line: <b>{contact.phone}</b>
        </p>
      </div>

      {status === 'sent' ? (
        <div className="cp-success" role="status">
          <b>✓ Message sent</b>
          <p>Thanks — your account team will reply by {replyBy}.</p>
          <button type="button" className="cp-btn cp-btn--ghost" onClick={() => setStatus('idle')}>
            Send another message
          </button>
        </div>
      ) : (
        <form className="cp-form" onSubmit={onSubmit} noValidate>
          <div className="cp-form__pair">
            <div className="cp-field">
              <label htmlFor="cp-fb-topic">Topic</label>
              <select id="cp-fb-topic" name="topic" className="cp-input" required>
                {feedbackTopics.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="cp-field cp-mobile-hide">
              <label htmlFor="cp-fb-site">Site</label>
              {/* Follows the page's site picker until the user picks a site here. */}
              <SiteSelect id="cp-fb-site" className="cp-input" value={formSite ?? siteId} onChange={setFormSite} />
            </div>
          </div>
          <div className="cp-field">
            <label htmlFor="cp-fb-message">Your message</label>
            <textarea
              id="cp-fb-message"
              name="message"
              rows={4}
              className="cp-input"
              placeholder="Tell us what's working, what isn't, or what you need"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'cp-fb-message-error' : undefined}
            />
            {error && (
              <span id="cp-fb-message-error" className="cp-error">
                {error}
              </span>
            )}
          </div>
          <div className="cp-form__foot">
            <label className="cp-check">
              <input type="checkbox" name="callback" />
              Please call me back
            </label>
            <button type="submit" className="cp-btn cp-btn--gold" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send to my account team'}
            </button>
          </div>
          {status === 'error' && (
            <span className="cp-error" role="alert">
              We couldn&apos;t send your message. Try again, or call {contact.phone}.
            </span>
          )}
          <p className="cp-urgent--mobile">
            Urgent? Call 24/7: <b>{contact.phone}</b>
          </p>
        </form>
      )}
    </section>
  )
}
