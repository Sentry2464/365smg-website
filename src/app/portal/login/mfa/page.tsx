import type { Metadata } from 'next'
import { requireStep } from '@/server/session'
import { checkCode } from '../actions'
import { AuthForm } from '../AuthForm'
import { AuthShell } from '../AuthShell'
import { CodeField } from '../CodeField'

export const metadata: Metadata = { title: 'Enter your code | 365 SMG Client Portal' }

export default async function MfaPage() {
  await requireStep('mfa')
  return (
    <AuthShell
      title="Enter your code"
      intro={<p>Open your authenticator app and enter the 6-digit code for the 365 SMG Client Portal.</p>}
    >
      <AuthForm action={checkCode} submitLabel="Sign in">
        <CodeField />
      </AuthForm>
      <p className="cp-help">
        Lost your phone? Call the 24/7 operations line and we&apos;ll reset two-step login after confirming who you are.
      </p>
    </AuthShell>
  )
}
