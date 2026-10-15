import { afterEach, describe, expect, it, vi } from 'vitest';

// 365 SMG client edition: the middleware only sets headers (no analytics).
describe('middleware', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('lets only the client portal frame the map by default', async () => {
    const { middleware } = await import('./middleware');
    const csp = middleware().headers.get('content-security-policy');
    expect(csp).toContain('frame-ancestors https://portal.365securitymg.com');
  });

  it('takes the framing site from OSIRIS_FRAME_ANCESTORS', async () => {
    vi.stubEnv('OSIRIS_FRAME_ANCESTORS', 'http://localhost:3000');
    const { middleware } = await import('./middleware');
    expect(middleware().headers.get('content-security-policy')).toContain('frame-ancestors http://localhost:3000');
  });
});
