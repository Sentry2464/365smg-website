import type { Database } from 'better-sqlite3'
import { openDatabase } from './core.mjs'

// One connection per server process; reused across hot reloads in development.
const g = globalThis as unknown as { smgDb?: Database }

export function db() {
  g.smgDb ??= openDatabase()
  return g.smgDb
}
