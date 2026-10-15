import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, totpAt, verifyTotp } from '../totp'

// RFC 6238 appendix B (SHA-1), secret "12345678901234567890", last 6 digits.
const secret = base32Encode(Buffer.from('12345678901234567890'))

describe('totp', () => {
  it('round-trips base32', () => {
    expect(base32Decode(secret).toString()).toBe('12345678901234567890')
  })

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC vector at t=%i', (t, code) => {
    expect(totpAt(secret, Math.floor(t / 30))).toBe(code)
  })

  it('accepts one step of drift and refuses reuse', () => {
    const now = 1234567890 * 1000
    const step = Math.floor(1234567890 / 30)
    expect(verifyTotp(secret, totpAt(secret, step - 1), null, now)).toBe(step - 1)
    expect(verifyTotp(secret, totpAt(secret, step - 2), null, now)).toBeNull()
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull()
    expect(verifyTotp(secret, '12345', null, now)).toBeNull()
  })
})
