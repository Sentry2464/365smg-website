import type { Metadata } from 'next'
import { MIN_PASSWORD_LENGTH } from '@/server/auth'
import { requireStep } from '@/server/session'
import { setNewPassword } from '../actions'
import { AuthForm } from '../AuthForm'
import { AuthShell } from '../AuthShell'

export const metadata: Metadata = { title: 'Choose a password | 365 SMG Client Portal' }

export default async function NewPasswordPage() {
  const { user } = await requireStep('password')
  return (
    <AuthShell
      title="Choose your password"
      intro={
        <p>
          Welcome, {user.name.split(' ')[0]}. Replace your temporary password with one only you know. Use at least{' '}
          {MIN_PASSWORD_LENGTH} characters; a short phrase is easiest to remember.
        </p>
      }
    >
      <AuthForm action={setNewPassword} submitLabel="Save password">
        <input type="hidden" name="username" autoComplete="username" value={user.email} readOnly />
        <div className="cp-field">
          <label htmlFor="cp-new-password">New password</label>
          <input
            id="cp-new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className="cp-input"
          />
        </div>
        <div className="cp-field">
          <label htmlFor="cp-new-password-confirm">Type it again</label>
          <input
            id="cp-new-password-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            className="cp-input"
          />
        </div>
      </AuthForm>
    </AuthShell>
  )
}
