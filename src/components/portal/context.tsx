'use client'

import { createContext, useContext } from 'react'
import type { PortalClient, PortalUser, Site } from './data'

export interface PortalContextValue {
  user: PortalUser
  client: PortalClient
  sites: Site[]
}

const PortalContext = createContext<PortalContextValue | null>(null)

export const PortalProvider = PortalContext.Provider

export function usePortal() {
  const value = useContext(PortalContext)
  if (!value) throw new Error('usePortal must be used inside <PortalProvider>')
  return value
}
