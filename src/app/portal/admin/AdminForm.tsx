'use client'

import { useActionState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { AdminState } from './actions'

function Submit({ label, variant }: { label: string; variant: 'gold' | 'ghost' }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`cp-btn cp-btn--${variant}`} disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  )
}

/** A form bound to an admin action, showing its error, confirmation or one-time secret inline. */
export function AdminForm({
  action,
  submitLabel,
  variant = 'gold',
  className = 'cp-form',
  resetOnSuccess = true,
  children,
}: {
  action: (state: AdminState, form: FormData) => Promise<AdminState>
  submitLabel: string
  variant?: 'gold' | 'ghost'
  className?: string
  resetOnSuccess?: boolean
  children?: ReactNode
}) {
  const [state, formAction] = useActionState(action, {})
  return (
    <form action={formAction} className={className} key={resetOnSuccess && state.message ? state.message : undefined}>
      {children}
      <div className="cp-admin__formfoot">
        <Submit label={submitLabel} variant={variant} />
        {state.error && (
          <span className="cp-error" role="alert">
            {state.error}
          </span>
        )}
        {state.message && (
          <span className="cp-admin__ok" role="status">
            {state.message} {state.secret && <code className="cp-auth__key">{state.secret}</code>}
          </span>
        )}
      </div>
    </form>
  )
}
