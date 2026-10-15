import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { pendingMfaSecret } from '@/server/auth'
import { db } from '@/server/db'
import { requireStep } from '@/server/session'
import { otpauthUrl } from '@/server/totp'
import { finishMfaSetup } from '../actions'
import { AuthForm } from '../AuthForm'
import { AuthShell } from '../AuthShell'
import { CodeField } from '../CodeField'

export const metadata: Metadata = { title: 'Set up two-step login | 365 SMG Client Portal' }

export default async function MfaSetupPage() {
  const c = await requireStep('mfa-setup')
  const secret = pendingMfaSecret(db(), c)
  const qr = await QRCode.toDataURL(otpauthUrl(secret, c.user.email), { margin: 1, width: 200 })
  return (
    <AuthShell
      title="Set up two-step login"
      intro={
        <p>
          Every sign-in needs a 6-digit code from an authenticator app on your phone, such as Microsoft Authenticator or
          Google Authenticator. This keeps your sites&apos; information safe even if your password leaks.
        </p>
      }
    >
      <ol className="cp-auth__steps">
        <li>Open your authenticator app and add a new account.</li>
        <li>
          Scan this code:
          {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL */}
          <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="cp-auth__qr" />
          <span className="cp-help">
            Can&apos;t scan? Enter this key instead: <code className="cp-auth__key">{secret.match(/.{1,4}/g)!.join(' ')}</code>
          </span>
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <AuthForm action={finishMfaSetup} submitLabel="Turn on two-step login">
        <CodeField />
      </AuthForm>
    </AuthShell>
  )
}
