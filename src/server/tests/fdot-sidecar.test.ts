import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import http from 'node:http'
import net, { type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The FDOT camera sidecar (deploy/globe/fdot/sidecar.mjs) against a fake FL511.

const rows = Array.from({ length: 150 }, (_, i) => ({
  id: 1000 + i,
  roadway: 'I-4',
  direction: i % 2 ? 'Eastbound' : 'Westbound',
  location: `I-4 at Exit ${i}`,
  city: i < 100 ? 'Orlando' : 'Tampa',
  county: i < 100 ? 'Orange' : 'Hillsborough',
  latLng: { geography: { wellKnownText: `POINT (-81.${String(i).padStart(3, '0')} 28.5)` } },
  images: [{ imageUrl: `/map/Cctv/${1000 + i}` }],
}))
rows.push({ ...rows[0], id: 9, latLng: { geography: { wellKnownText: 'POINT (-74 40.7)' } }, images: [{ imageUrl: '/map/Cctv/9' }] }) // New York: dropped
rows.push({ ...rows[0], id: 10, images: [{ imageUrl: 'https://evil.example/x.jpg' }] }) // off-site still: dropped

const seen: { path: string; ua?: string }[] = []
let fl511: http.Server
let sidecar: ChildProcess
let base = ''
const dir = mkdtempSync(path.join(tmpdir(), 'fdot-'))

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo
      s.close(() => resolve(port))
    })
  })

beforeAll(async () => {
  fl511 = http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x')
    seen.push({ path: url.pathname, ua: req.headers['user-agent'] })
    if (url.pathname === '/List/GetData/Cameras') {
      const q = JSON.parse(url.searchParams.get('query')!)
      res.setHeader('content-type', 'application/json')
      return res.end(JSON.stringify({ recordsTotal: rows.length, data: rows.slice(q.start, q.start + q.length) }))
    }
    if (url.pathname.startsWith('/map/Cctv/')) {
      res.setHeader('content-type', 'image/jpeg')
      return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => fl511.listen(0, '127.0.0.1', r))
  const port = await freePort()
  sidecar = spawn(process.execPath, [path.resolve(__dirname, '../../../deploy/globe/fdot/sidecar.mjs')], {
    env: {
      ...process.env,
      FDOT_BASE: `http://127.0.0.1:${(fl511.address() as AddressInfo).port}`,
      FDOT_PORT: String(port),
      FDOT_COUNTIES: 'Orange',
      FDOT_STATE_FILE: path.join(dir, 'cameras.json'),
      FDOT_PACK_FILE: path.join(dir, 'cctv_sources.florida.json'),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  await new Promise<void>((resolve) => sidecar.stdout!.on('data', (d) => String(d).includes('camera list:') && resolve()))
  base = `http://127.0.0.1:${port}`
})

afterAll(() => {
  sidecar?.kill()
  fl511?.close()
})

describe('FDOT camera sidecar', () => {
  it('builds the God’s Eye pack from FDOT’s list, identified and filtered', async () => {
    const res = await fetch(`${base}/fdot/cameras.json`)
    expect(res.status).toBe(200)
    const pack = (await res.json()) as Record<string, unknown>[]
    expect(pack).toHaveLength(100) // Orange County only; Tampa, New York and the off-site still are out
    expect(pack[0]).toMatchObject({
      id: 'fdot-1000',
      name: 'I-4 at Exit 0',
      city: 'Orlando',
      cityId: 'orlando',
      provider: 'FDOT',
      lat: 28.5,
      lon: -81,
      headingDeg: 270,
      headingConfidence: 'low',
      feedType: 'image',
      url: `${base}/fdot/snap/fdot-1000`,
      snapshotUrl: `${base}/fdot/snap/fdot-1000`,
      sourceKind: 'fdot',
      poseSource: 'fdot',
      license: 'Florida Department of Transportation / FL511 (approved for 365 SMG clients)',
    })
    // The same pack, as the file God's Eye reads: a bare JSON array, world-readable.
    const file = path.join(dir, 'cctv_sources.florida.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(pack)
    expect(statSync(file).mode & 0o044).toBe(0o044)
    const listCalls = seen.filter((s) => s.path === '/List/GetData/Cameras')
    expect(listCalls.length).toBe(2) // 152 rows, 100 per page
    expect(listCalls.every((s) => s.ua === '365SMG-IntelMap (globe.365securitymg.com; admin@365securitymg.com)')).toBe(true)
  })

  it('fetches each camera from FDOT at most once a minute, for everyone', async () => {
    const all = await Promise.all([1, 2, 3].map(() => fetch(`${base}/fdot/snap/fdot-1001`)))
    expect(all.map((r) => r.status)).toEqual([200, 200, 200])
    expect(all[0].headers.get('content-type')).toBe('image/jpeg')
    await fetch(`${base}/fdot/snap/fdot-1001`)
    expect(seen.filter((s) => s.path === '/map/Cctv/1001')).toHaveLength(1)
  })

  it('only serves cameras in FDOT’s list', async () => {
    expect((await fetch(`${base}/fdot/snap/fdot-1120`)).status).toBe(404) // Tampa: filtered out
    expect((await fetch(`${base}/fdot/snap/fdot-10`)).status).toBe(404)
    expect((await fetch(`${base}/fdot/snap/..%2F..%2Fetc`)).status).toBe(404)
    expect(seen.some((s) => s.path === '/map/Cctv/1120')).toBe(false)
    expect(await (await fetch(`${base}/healthz`)).text()).toBe('ok')
  })
})
