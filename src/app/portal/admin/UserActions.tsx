'use client'

import { resetUserMfa, resetUserPassword, toggleUser } from './actions'
import { AdminForm } from './AdminForm'

export function UserActions({ userId, disabled, self }: { userId: string; disabled: boolean; self: boolean }) {
  return (
    <div className="cp-admin__actions">
      <AdminForm action={resetUserPassword} submitLabel="Reset password" variant="ghost" className="cp-admin__inline">
        <input type="hidden" name="userId" value={userId} />
      </AdminForm>
      <AdminForm action={resetUserMfa} submitLabel="Reset two-step" variant="ghost" className="cp-admin__inline">
        <input type="hidden" name="userId" value={userId} />
      </AdminForm>
      {!self && (
        <AdminForm
          action={toggleUser}
          submitLabel={disabled ? 'Enable' : 'Disable'}
          variant="ghost"
          className="cp-admin__inline"
        >
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="disable" value={disabled ? '0' : '1'} />
        </AdminForm>
      )}
    </div>
  )
}
