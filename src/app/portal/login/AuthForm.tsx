'use client'

import { useActionState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { AuthState } from './actions'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="cp-btn cp-btn--gold cp-auth__submit" disabled={pending}>
      {pending ? 'Checking…' : label}
    </button>
  )
}

export function AuthForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: AuthState, form: FormData) => Promise<AuthState>
  submitLabel: string
  children: ReactNode
}) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className="cp-form">
      {children}
      {state.error && (
        <p className="cp-error cp-auth__error" role="alert">
          {state.error}
        </p>
      )}
      <Submit label={submitLabel} />
    </form>
  )
}
