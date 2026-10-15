/**
 * 365 SMG client edition. Upstream's "stealth" fetch sent random browser user agents and
 * spoofed residential X-Forwarded-For / X-Real-IP addresses to get around data providers'
 * limits. This replacement keeps the same exports for the code that imports them, but
 * every request says who it is, as the providers (FDOT included) were told it would.
 */

export const SMG_USER_AGENT =
  process.env.OSIRIS_USER_AGENT || '365SMG-IntelMap (globe.365securitymg.com; admin@365securitymg.com)';

/** Request headers for an outbound fetch: our identity, plus whatever the caller adds. */
export function stealthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent': SMG_USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
    ...extraHeaders,
  };
}

/** fetch() with our identifying headers and a 30-second limit. */
export async function stealthFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const extra = init?.headers
    ? Object.fromEntries(
        init.headers instanceof Headers
          ? init.headers.entries()
          : Array.isArray(init.headers)
            ? init.headers
            : Object.entries(init.headers),
      )
    : undefined;
  const signals = [AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])];
  return fetch(url, { ...init, headers: stealthHeaders(extra), signal: AbortSignal.any(signals) });
}
