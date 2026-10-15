'use server'

import { redirect } from 'next/navigation'
import { changePassword, confirmMfaSetup, nextStep, passwordLogin, sessionFromToken, verifyMfa } from '@/server/auth'
import { db } from '@/server/db'
import { homePath, readToken, requestMeta, requireStep, setSessionCookie, stepPath } from '@/server/session'

export type AuthState = { error?: string }

async function goToNextStep(token: string) {
  const c = sessionFromToken(db(), token)
  if (!c) redirect('/portal/login')
  const step = nextStep(c)
  redirect(step === 'done' ? homePath(c.user.role) : stepPath[step])
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const meta = await requestMeta()
  const result = await passwordLogin(db(), String(form.get('email') ?? ''), String(form.get('password') ?? ''), meta)
  if (!result.ok) return { error: result.error }
  await setSessionCookie(result.token)
  await goToNextStep(result.token)
  return {}
}

export async function setNewPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const c = await requireStep('password')
  const { ip } = await requestMeta()
  const error = await changePassword(db(), c, String(form.get('password') ?? ''), String(form.get('confirm') ?? ''), ip)
  if (error) return { error }
  await goToNextStep((await readToken())!)
  return {}
}

export async function finishMfaSetup(_: AuthState, form: FormData): Promise<AuthState> {
  const c = await requireStep('mfa-setup')
  const result = confirmMfaSetup(db(), c, String(form.get('code') ?? ''), await requestMeta())
  if (!result.ok) return { error: result.error }
  await setSessionCookie(result.token)
  await goToNextStep(result.token)
  return {}
}

export async function checkCode(_: AuthState, form: FormData): Promise<AuthState> {
  const c = await requireStep('mfa')
  const result = verifyMfa(db(), c, String(form.get('code') ?? ''), await requestMeta())
  if (!result.ok) return { error: result.error }
  await setSessionCookie(result.token)
  await goToNextStep(result.token)
  return {}
}
