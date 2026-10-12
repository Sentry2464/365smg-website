'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/server/db'
import { requestMeta, requireUser } from '@/server/session'
import {
  createClient,
  createSite,
  createUser,
  resetMfa,
  resetPassword,
  setRegistryEnabled,
  setUserDisabled,
  ValidationError,
} from '@/server/store'

export type AdminState = { error?: string; message?: string; secret?: string }

async function adminActor() {
  const { user } = await requireUser(['admin'])
  return { id: user.id, ip: (await requestMeta()).ip }
}

async function run(fn: () => Promise<AdminState> | AdminState): Promise<AdminState> {
  try {
    const result = await fn()
    revalidatePath('/portal/admin', 'layout')
    return result
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message }
    throw err
  }
}

const field = (form: FormData, name: string) => form.get(name) ?? ''

export async function addClient(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await adminActor()
  return run(() => {
    const c = createClient(db(), actor, {
      name: field(form, 'name'),
      industry: field(form, 'industry'),
      industryPlural: field(form, 'industryPlural'),
      managerEmail: field(form, 'managerEmail'),
    })
    return { message: `Added ${c.name}. Open it from the list to add its sites and users.` }
  })
}

export async function addSite(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await adminActor()
  return run(() => {
    const s = createSite(db(), actor, String(field(form, 'clientId')), {
      name: field(form, 'name'),
      city: field(form, 'city'),
      timeZone: field(form, 'timeZone'),
      lat: field(form, 'lat'),
      lng: field(form, 'lng'),
    })
    return { message: `Added ${s.name}.` }
  })
}

export async function addUser(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await adminActor()
  return run(async () => {
    const { user, temporaryPassword } = await createUser(db(), actor, {
      email: field(form, 'email'),
      name: field(form, 'name'),
      role: field(form, 'role'),
      clientId: field(form, 'clientId'),
    })
    return {
      message: `Created ${user.email}. Give them this temporary password by phone or in person. It is shown only once.`,
      secret: temporaryPassword,
    }
  })
}

export async function resetUserPassword(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await adminActor()
  return run(async () => {
    const password = await resetPassword(db(), actor, String(field(form, 'userId')))
    return { message: 'New temporary password (shown once):', secret: password }
  })
}

export async function resetUserMfa(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await adminActor()
  return run(() => {
    resetMfa(db(), actor, String(field(form, 'userId')))
    return { message: 'Two-step login reset. They set it up again at their next sign-in.' }
  })
}

export async function toggleUser(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await adminActor()
  return run(() => {
    const disable = field(form, 'disable') === '1'
    setUserDisabled(db(), actor, String(field(form, 'userId')), disable)
    return { message: disable ? 'Account disabled and signed out.' : 'Account enabled.' }
  })
}

export async function toggleRegistry(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await adminActor()
  return run(() => {
    const on = field(form, 'enable') === '1'
    setRegistryEnabled(db(), actor, String(field(form, 'clientId')), on)
    // Fetch the client's county files now rather than at the next 6-hourly run.
    if (on) void import('@/server/alerts').then((a) => a.runRegistryNow(db())).catch(() => {})
    return {
      message: on
        ? 'Registry card turned on. FDLE’s county file is downloading and appears on the client’s dashboard within a few minutes.'
        : 'Registry card turned off for this client.',
    }
  })
}
