import { describe, expect, it } from 'vitest'
import { addBusinessDays, daysBetween, formatDay, todayEt } from '../dates'

describe('business dates', () => {
  it('uses the Eastern date, not UTC', () => {
    // 9:30 pm on Monday 12 Oct in Orlando is already Tuesday in UTC.
    expect(todayEt(new Date('2026-10-13T01:30:00Z'))).toBe('2026-10-12')
    expect(addBusinessDays(todayEt(new Date('2026-10-13T01:30:00Z')), 2)).toBe('2026-10-14')
  })

  it('skips weekends and formats without shifting the day', () => {
    expect(addBusinessDays('2026-10-16', 2)).toBe('2026-10-20') // Friday → Tuesday
    expect(daysBetween('2026-10-12', '2026-11-11')).toBe(30)
    expect(daysBetween('2026-10-12', '2026-10-11')).toBe(-1)
    expect(formatDay('2026-10-14')).toBe('Wednesday, October 14')
  })
})
