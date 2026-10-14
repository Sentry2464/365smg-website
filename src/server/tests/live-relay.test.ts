import { type ChildProcess, spawn } from 'node:child_process'
import { generateKeyPairSync, verify } from 'node:crypto'
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net, { type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The live relay (deploy/globe/fdot/live-relay.mjs) against a fake Cloudflare Stream API, a
// fake camera service and a stand-in for ffmpeg.

const dir = mkdtempSync(path.join(tmpdir(), 'live-'))
const state = path.join(dir, 'state')
const ffmpegLog = path.join(dir, 'ffmpeg.log')
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = Buffer.from(privateKey.export({ type: 'pkcs1', format: 'pem' }) as string).toString('base64')

const calls: { method: string; path: string; auth?: string; body?: Record<string, unknown> }[] = []
let cf: http.Server
let sidecar: http.Server
let relay: ChildProcess
let base = ''
let out = ''

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo
      s.close(() => resolve(port))
    })
  })
const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)))

beforeAll(async () => {
  const inputs: { uid: string; meta: { name: string } }[] = []
  cf = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', () => {
      const p = req.url!.replace('/client/v4/accounts/acct/stream', '')
      calls.push({ method: req.method!, path: p, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined })
      const ok = (result: unknown) => res.end(JSON.stringify({ success: true, result }))
      if (req.method === 'POST' && p === '/keys') return ok({ id: 'key-1', pem })
      if (req.method === 'GET' && p === '/live_inputs') return ok(inputs)
      if (req.method === 'POST' && p === '/live_inputs') {
        const made = { uid: `in-${inputs.length + 1}`, meta: JSON.parse(raw).meta }
        inputs.push(made)
        return ok(made)
      }
      let m = /^\/live_inputs\/([\w-]+)$/.exec(p)
      if (m && req.method === 'PUT') return ok({ uid: m[1], rtmps: { url: 'rtmps://live.example:443/live/', streamKey: `KEY${m[1]}` } })
      if (m && req.method === 'GET') return ok({ uid: m[1], status: { current: { state: 'connected' } } })
      m = /^\/live_inputs\/([\w-]+)\/videos$/.exec(p)
      if (m) return ok([{ uid: `rec-${m[1]}`, status: { state: 'ready' } }])
      if (req.method === 'DELETE') return ok(null)
      res.statusCode = 404
      res.end(JSON.stringify({ success: false, errors: [{ message: 'no route' }] }))
    })
  })
  sidecar = http.createServer((req, res) => {
    const m = /^\/fdot\/video\/(fdot-(\d+))$/.exec(req.url!)
    if (!m || Number(m[2]) > 10) return void ((res.statusCode = 404), res.end())
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ id: m[1], name: `Cam ${m[2]}`, city: 'Orlando', videoUrl: m[2] === '9' ? null : `https://video.example/${m[2]}.m3u8` }))
  })
  const [cfPort, scPort, port] = [await listen(cf), await listen(sidecar), await freePort()]
  const ffmpeg = path.join(dir, 'ffmpeg')
  writeFileSync(ffmpeg, `#!/bin/sh\necho "$@" >> ${ffmpegLog}\nexec sleep 600\n`)
  chmodSync(ffmpeg, 0o755)
  relay = spawn(process.execPath, [path.resolve(__dirname, '../../../deploy/globe/fdot/live-relay.mjs')], {
    env: {
      ...process.env,
      LIVE_PORT: String(port),
      LIVE_STATE_DIR: state,
      FDOT_SIDECAR: `http://127.0.0.1:${scPort}`,
      FFMPEG_BIN: ffmpeg,
      CF_API_BASE: `http://127.0.0.1:${cfPort}/client/v4`,
      CF_ACCOUNT_ID: 'acct',
      CF_API_TOKEN: 'tok',
      STREAM_CUSTOMER_DOMAIN: 'customer-test.cloudflarestream.com',
      LIVE_SESSION_MIN: '30', // asks for more than FDOT allows: capped at 5
      LIVE_CLIENT_MONTHLY_MIN: '10',
      LIVE_MONTHLY_MIN: '25',
      LIVE_MAX_CAMERAS: '2',
      LIVE_IDLE_STOP_S: '1',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  relay.stdout!.on('data', (d) => (out += d))
  await new Promise<void>((resolve) => relay.stdout!.on('data', () => out.includes('listening') && resolve()))
  base = `http://127.0.0.1:${port}`
})

afterAll(() => {
  relay?.kill()
  cf?.close()
  sidecar?.close()
})

const act = (cid: string, cam: string, action: 'start' | 'stop' | 'status') =>
  fetch(`${base}/live/${cam}/${action}`, { method: action === 'status' ? 'GET' : 'POST', headers: { 'x-smg-cid': cid } })
const pulls = () => {
  try {
    return readFileSync(ffmpegLog, 'utf8').trim().split('\n')
  } catch {
    return []
  }
}

describe('live relay', () => {
  it('starts a camera: signed 5-minute link, signed-only input, one pull from FDOT', async () => {
    const res = await act('client-a', 'fdot-1', 'start')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ camera: 'fdot-1', name: 'Cam 1', sessionSeconds: 300, minutesLeft: 5 })
    const m = /^https:\/\/customer-test\.cloudflarestream\.com\/([\w-]+\.[\w-]+\.[\w-]+)\/iframe\?/.exec(body.iframeUrl)
    expect(m).not.toBeNull()
    const [h, p, sig] = m![1].split('.')
    expect(verify('sha256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, 'base64url'))).toBe(true)
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', kid: 'key-1' })
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    expect(claims.sub).toBe('in-1')
    expect(claims.exp - Date.now() / 1000).toBeGreaterThan(320)
    expect(claims.exp - Date.now() / 1000).toBeLessThan(335)

    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true)
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).toEqual({
      meta: { name: 'smg-fdot-1' },
      recording: { mode: 'automatic', requireSignedURLs: true, allowedOrigins: ['globe.365securitymg.com'], timeoutSeconds: 10 },
    })
    await new Promise((r) => setTimeout(r, 200))
    expect(pulls()).toHaveLength(1)
    expect(pulls()[0]).toContain('-i https://video.example/1.m3u8 -c:v copy -an -f flv rtmps://live.example:443/live/KEYin-1')
    expect(pulls()[0]).toContain('-user_agent 365SMG-IntelMap')
    expect(out).not.toContain('KEYin-1') // stream keys never logged
    expect(statSync(path.join(state, 'signing-key.json')).mode & 0o077).toBe(0)
    expect(statSync(path.join(state, 'inputs.json')).mode & 0o077).toBe(0)
    expect((await (await act('client-a', 'fdot-1', 'status')).json()).live).toBe(true)
  })

  it('keeps each client to one camera, and shares a camera’s pull between clients', async () => {
    const second = await act('client-a', 'fdot-2', 'start')
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: 'one_camera', watching: 'fdot-1' })
    expect((await act('client-b', 'fdot-1', 'start')).status).toBe(200)
    expect(pulls()).toHaveLength(1) // same camera: same pull
    expect((await act('client-a', 'fdot-1', 'stop')).status).toBe(200)
    expect((await act('client-a', 'fdot-2', 'start')).status).toBe(200) // free once closed
  })

  it('enforces the camera cap and the monthly limits', async () => {
    // Two cameras pulled already (LIVE_MAX_CAMERAS=2).
    expect(await (await act('client-c', 'fdot-3', 'start')).json()).toMatchObject({ error: 'busy' })
    await act('client-a', 'fdot-2', 'stop')
    expect(await (await act('client-a', 'fdot-1', 'start')).json()).toMatchObject({ error: 'client_limit' }) // 10 used
    expect((await act('client-c', 'fdot-1', 'start')).status).toBe(200) // 20 in total
    expect((await act('client-d', 'fdot-1', 'start')).status).toBe(200) // 25
    expect(await (await act('client-e', 'fdot-1', 'start')).json()).toMatchObject({ error: 'monthly_limit' })
    const usage = await (await fetch(`${base}/live/usage`)).json()
    expect(usage).toMatchObject({ total: 25, clients: { 'client-a': 10, 'client-b': 5, 'client-c': 5, 'client-d': 5 } })
    expect(usage.limits).toEqual({ session: 5, client: 10, month: 25 })
    expect(JSON.parse(readFileSync(path.join(state, 'usage.json'), 'utf8')).total).toBe(25)
  })

  it('refuses unknown cameras, cameras without video, and requests without a client', async () => {
    expect(await (await act('client-z', 'fdot-99', 'start')).json()).toMatchObject({ error: 'unknown_camera' })
    expect(await (await act('client-z', 'fdot-9', 'start')).json()).toMatchObject({ error: 'no_video' })
    expect((await fetch(`${base}/live/fdot-1/start`, { method: 'POST' })).status).toBe(404)
  })

  it('stops pulling once nobody watches, and deletes the recordings', async () => {
    for (const c of ['client-b', 'client-c', 'client-d']) await act(c, 'fdot-1', 'stop')
    await new Promise((r) => setTimeout(r, 3_000))
    expect((await (await fetch(`${base}/live/usage`)).json()).running).toEqual([])
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/rec-in-1')).toBe(true)
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/rec-in-2')).toBe(true)
  })
})
