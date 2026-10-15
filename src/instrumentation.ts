// Runs once when the server starts. Polls public alert feeds for client sites in
// production (or with SMG_ALERTS=1); SMG_ALERTS=0 turns polling off.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const on = process.env.SMG_ALERTS === '1' || (process.env.NODE_ENV === 'production' && process.env.SMG_ALERTS !== '0')
  if (!on) return
  const [{ startAlertPolling }, { db }] = await Promise.all([import('./server/alerts'), import('./server/db')])
  startAlertPolling(db)
}
