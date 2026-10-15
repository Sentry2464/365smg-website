import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stealthFetch } from '@/lib/stealthFetch';
import { clearStills, GET } from './route';

const CAM = 'https://fl511.com/map/Cctv/123';

vi.mock('@/app/api/cctv/florida', () => ({
  fetchFloridaCameras: vi.fn(async () => [{ id: 'fdot-123', feed_url: CAM }]),
}));
vi.mock('@/lib/stealthFetch', () => ({ stealthFetch: vi.fn() }));

const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0]), { headers: { 'content-type': 'image/jpeg' } });
const get = (url: string) => GET(new Request(`http://x/api/smg/fdot-snapshot?url=${encodeURIComponent(url)}`));

beforeEach(() => {
  clearStills();
  vi.mocked(stealthFetch).mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('FDOT snapshots', () => {
  it('fetches each camera at most once a minute, for everyone', async () => {
    vi.mocked(stealthFetch).mockImplementation(async () => jpeg());
    const all = await Promise.all([get(CAM), get(CAM), get(CAM)]);
    expect(all.map(r => r.status)).toEqual([200, 200, 200]);
    expect(all[0].headers.get('content-type')).toBe('image/jpeg');
    expect(stealthFetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(59_000);
    await get(CAM);
    expect(stealthFetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await get(CAM);
    expect(stealthFetch).toHaveBeenCalledTimes(2);
  });

  it('only fetches cameras in FDOT’s own list', async () => {
    expect((await get('https://evil.example/x.jpg')).status).toBe(404);
    expect((await get('https://fl511.com/other')).status).toBe(404);
    expect(stealthFetch).not.toHaveBeenCalled();
  });

  it('keeps showing a recent still when FDOT is briefly down, and refuses non-images', async () => {
    vi.mocked(stealthFetch).mockImplementationOnce(async () => jpeg());
    expect((await get(CAM)).status).toBe(200);
    vi.advanceTimersByTime(61_000);
    vi.mocked(stealthFetch).mockImplementationOnce(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    expect((await get(CAM)).status).toBe(200);
    vi.advanceTimersByTime(5 * 60_000);
    vi.mocked(stealthFetch).mockImplementationOnce(async () => new Response('busy', { status: 503 }));
    expect((await get(CAM)).status).toBe(502);
  });
});
