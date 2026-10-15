// Calendar dates (YYYY-MM-DD) for the business, in Eastern time whatever the server's zone.

export const BUSINESS_TZ = 'America/New_York'

/** Today's date in Eastern time, as YYYY-MM-DD. */
export const todayEt = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ })

// Dates are handled at noon UTC, so no zone or DST change moves them to another day.
const noon = (ymd: string) => new Date(`${ymd}T12:00:00Z`)

/** The date `days` business days (Monday to Friday) after `ymd`. */
export function addBusinessDays(ymd: string, days: number) {
  const d = noon(ymd)
  while (days > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days--
  }
  return d.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000)

/** "Tuesday, October 14", or with `style` any other toLocaleDateString options. */
export const formatDay = (ymd: string, style: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) =>
  noon(ymd).toLocaleDateString('en-US', { ...style, timeZone: 'UTC' })

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(noon(s).getTime())
