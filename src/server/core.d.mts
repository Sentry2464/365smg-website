import type { Database } from 'better-sqlite3'

export function dataDir(): string
export function migrate(db: Database): void
export function openDatabase(file?: string): Database
export function hashPassword(password: string): Promise<string>
export function verifyPassword(password: string, stored: string): Promise<boolean>
export function temporaryPassword(): string
export function newId(): string
export function audit(
  db: Database,
  entry: {
    actorId?: string | null
    clientId?: string | null
    action: string
    target?: string | null
    ip?: string | null
    detail?: Record<string, unknown>
  },
): void
