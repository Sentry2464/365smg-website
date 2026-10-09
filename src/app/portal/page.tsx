import { ClientPortal, type PortalPreview } from '@/components/portal/ClientPortal'
import type { ThreatLevel } from '@/components/portal/data'

const THREATS: ThreatLevel[] = ['LOW', 'ELEVATED', 'HIGH']

// Design-review states, e.g. /portal?state=no-alert,empty-alerts,sent&threat=HIGH
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const states = String(params.state ?? '').split(',')
  const threat = String(params.threat ?? '').toUpperCase() as ThreatLevel
  const preview: PortalPreview = {
    noAlert: states.includes('no-alert'),
    emptyAlerts: states.includes('empty-alerts'),
    formsSent: states.includes('sent'),
    threat: THREATS.includes(threat) ? threat : undefined,
  }
  return <ClientPortal preview={preview} />
}
