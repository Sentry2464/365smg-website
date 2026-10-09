import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the format authenticator apps expect.
const STEP = 30
const DIGITS = 6
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function newTotpSecret() {
  return base32Encode(randomBytes(20))
}

export function totpAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(code).padStart(DIGITS, '0')
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP)

/**
 * Checks a code against the current step and one step either side (clock drift).
 * Returns the matching step so the caller can refuse to accept it twice.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null, now = Date.now()) {
  const given = Buffer.from(code.replace(/\s/g, ''))
  if (given.length !== DIGITS) return null
  const step = currentStep(now)
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep != null && s <= lastStep) continue
    if (timingSafeEqual(Buffer.from(totpAt(secret, s)), given)) return s
  }
  return null
}

export function otpauthUrl(secret: string, account: string, issuer = '365 SMG Client Portal') {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP) })
  return `otpauth://totp/${label}?${params}`
}
