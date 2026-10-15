import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { nextStep } from '@/server/auth'
import { currentSession, homePath, stepPath } from '@/server/session'
import { login } from './actions'
import { AuthForm } from './AuthForm'
import { AuthShell } from './AuthShell'

export const metadata: Metadata = { title: 'Sign in | 365 SMG Client Portal' }

export default async function LoginPage() {
  const c = await currentSession()
  if (c) {
    const step = nextStep(c)
    redirect(step === 'done' ? homePath(c.user.role) : stepPath[step])
  }
  return (
    <AuthShell title="Sign in">
      <AuthForm action={login} submitLabel="Continue">
        <div className="cp-field">
          <label htmlFor="cp-login-email">Email</label>
          <input id="cp-login-email" name="email" type="email" autoComplete="username" required className="cp-input" />
        </div>
        <div className="cp-field">
          <label htmlFor="cp-login-password">Password</label>
          <input
            id="cp-login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="cp-input"
          />
        </div>
      </AuthForm>
    </AuthShell>
  )
}
