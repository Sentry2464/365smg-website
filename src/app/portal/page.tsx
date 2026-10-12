import { redirect } from 'next/navigation'
import { ClientPortal, type PortalPreview } from '@/components/portal/ClientPortal'
import { placeSites, sampleFeed, type Site, type ThreatLevel } from '@/components/portal/data'
import { clientAlerts, liveFeed } from '@/server/alerts'
import { db } from '@/server/db'
import { missingList } from '@/server/fdle'
import { globeUrlFor } from '@/server/globe'
import { wantedList } from '@/server/publicsafety'
import { stormList } from '@/server/storms'
import { registryNear } from '@/server/registry'
import { audit } from '@/server/core.mjs'
import { requestMeta, requireUser } from '@/server/session'
import { clientScope } from '@/server/store'

const THREATS: ThreatLevel[] = ['LOW', 'ELEVATED', 'HIGH']
// Sample site alerts in development (unless SMG_DEMO=0) or with SMG_DEMO=1; live alerts otherwise.
const DEMO =
  process.env.SMG_DEMO === '1' || (process.env.NODE_ENV !== 'production' && process.env.SMG_DEMO !== '0')

// Design-review states, e.g. /portal?state=no-alert,empty-alerts,sent&threat=HIGH
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireUser()
  if (user.role !== 'client') redirect('/portal/admin')

  const scope = clientScope(db(), user.client_id!)
  const client = scope.client()!
  const rows = scope.sites()
  const positions = placeSites(rows)
  const sites: Site[] = rows.map((r, i) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    shortName: r.name.split(/\s+/).slice(0, 2).join(' '),
    city: r.city,
    timeZone: r.time_zone,
    map: positions[i],
    lat: r.lat,
    lng: r.lng,
  }))

  const params = await searchParams
  const states = String(params.state ?? '').split(',')
  const threat = String(params.threat ?? '').toUpperCase() as ThreatLevel
  const preview: PortalPreview = {
    noAlert: states.includes('no-alert'),
    emptyAlerts: states.includes('empty-alerts'),
    formsSent: states.includes('sent'),
    threat: THREATS.includes(threat) ? threat : undefined,
  }

  // Registry views are logged: who saw how many records, from where.
  const registry = registryNear(db(), client.id)
  if (registry) {
    audit(db(), {
      actorId: user.id,
      clientId: client.id,
      action: 'registry.view',
      ip: (await requestMeta()).ip,
      detail: { shown: registry.people.length, asOf: registry.asOf },
    })
  }

  const names = user.name.trim().split(/\s+/)
  return (
    <ClientPortal
      user={{
        name: user.name,
        firstName: names[0],
        initials: (names[0][0] + (names.length > 1 ? names[names.length - 1][0] : '')).toUpperCase(),
        email: user.email,
      }}
      client={{ name: client.name, industry: client.industry, industryPlural: client.industry_plural }}
      sites={sites}
      feed={DEMO ? sampleFeed(sites, { demo: true }) : liveFeed(sites, clientAlerts(db(), client.id))}
      updatedAt={new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: sites[0]?.timeZone ?? 'America/New_York',
      })}
      preview={preview}
      globeUrl={globeUrlFor(client.id)}
      storms={stormList(db())}
      localCameras={process.env.SMG_GLOBE_LOCAL_CAMERAS === '1'}
      wanted={wantedList(db())}
      missing={missingList(db())}
      registry={registry}
    />
  )
}
