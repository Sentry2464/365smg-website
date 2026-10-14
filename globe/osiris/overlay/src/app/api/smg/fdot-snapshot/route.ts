import { fetchFloridaCameras } from '@/app/api/cctv/florida';
import { stealthFetch } from '@/lib/stealthFetch';

/*
 * 365 SMG client edition: FDOT camera stills, fetched by this server for everyone.
 *
 * As agreed with FDOT: each camera is fetched at most once a minute, from this one server,
 * identified as us (see lib/stealthFetch), and nothing is kept beyond the current still.
 * Only URLs that are in FDOT's own camera list are fetched, so this is not an open proxy.
 */

export const dynamic = 'force-dynamic';

const MIN_INTERVAL_MS = 60_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 1_000;

interface Still {
  at: number;
  type: string;
  body: ArrayBuffer;
}

const stills = new Map<string, Still>(); // url -> latest still (oldest first, for eviction)
const inflight = new Map<string, Promise<Still>>();

async function fdotUrls(): Promise<Set<string>> {
  const cameras = await fetchFloridaCameras();
  return new Set(cameras.map(c => c.feed_url).filter((u): u is string => typeof u === 'string'));
}

async function fetchStill(url: string): Promise<Still> {
  const res = await stealthFetch(url, { headers: { Accept: 'image/*' }, signal: AbortSignal.timeout(10_000) });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !/^image\//i.test(type)) throw new Error(`FDOT still: HTTP ${res.status} ${type}`);
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new Error('FDOT still too large');
  return { at: Date.now(), type, body };
}

/** The current still: from memory if under a minute old, otherwise fetched once for all callers. */
export async function currentStill(url: string, now = Date.now()): Promise<Still> {
  const held = stills.get(url);
  if (held && now - held.at < MIN_INTERVAL_MS) return held;
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetchStill(url)
      .then(still => {
        stills.delete(url);
        stills.set(url, still);
        while (stills.size > MAX_ENTRIES) stills.delete(stills.keys().next().value!);
        return still;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  try {
    return await pending;
  } catch (err) {
    // FDOT unreachable: an older still beats none, while it's under 5 minutes old.
    if (held && now - held.at < 5 * MIN_INTERVAL_MS) return held;
    throw err;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  let known: Set<string>;
  try {
    known = await fdotUrls();
  } catch {
    return new Response('Camera list unavailable', { status: 503 });
  }
  if (!known.has(url)) return new Response('Not an FDOT camera', { status: 404 });
  try {
    const still = await currentStill(url);
    const age = Math.floor((Date.now() - still.at) / 1000);
    return new Response(still.body, {
      headers: {
        'Content-Type': still.type,
        'Cache-Control': `private, max-age=${Math.max(0, 60 - age)}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Camera still unavailable', { status: 502 });
  }
}

/** Test seam. */
export function clearStills() {
  stills.clear();
  inflight.clear();
}
