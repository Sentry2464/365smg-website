import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dataDir } from './core.mjs'

// Authenticator secrets are stored encrypted (AES-256-GCM) so a copy of the
// database alone can't be used to generate login codes. The key comes from
// SMG_SECRET_KEY (set in /etc/smg-portal.env on the VM).
let cachedKey: Buffer | null = null

function key() {
  if (cachedKey) return cachedKey
  const fromEnv = process.env.SMG_SECRET_KEY
  if (fromEnv) {
    cachedKey = Buffer.from(fromEnv, 'base64')
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('SMG_SECRET_KEY is not set')
  } else {
    // Development only: keep a generated key next to the dev database.
    const file = path.join(dataDir(), 'dev-secret.key')
    mkdirSync(dataDir(), { recursive: true })
    if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 })
    cachedKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
  }
  if (cachedKey.length !== 32) throw new Error('SMG_SECRET_KEY must be 32 bytes, base64-encoded')
  return cachedKey
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

export function decryptSecret(stored: string) {
  const [v, iv, tag, data] = stored.split('.')
  if (v !== 'v1') throw new Error('unknown secret format')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}
