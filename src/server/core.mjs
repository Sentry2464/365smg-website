// Shared by the Next.js app and the scripts/ command-line tools, so it is plain
// JavaScript with no path aliases.
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export function dataDir() {
  return process.env.SMG_DATA_DIR || path.join(process.cwd(), '.data')
}

const MIGRATIONS = [
  `
  CREATE TABLE clients (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    industry        TEXT NOT NULL,
    industry_plural TEXT NOT NULL,
    manager_email   TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    disabled_at     TEXT
  );

  CREATE TABLE sites (
    id         TEXT PRIMARY KEY,
    client_id  TEXT NOT NULL REFERENCES clients(id),
    slug       TEXT NOT NULL,
    name       TEXT NOT NULL,
    city       TEXT NOT NULL,
    time_zone  TEXT NOT NULL DEFAULT 'America/New_York',
    lat        REAL,
    lng        REAL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (client_id, id),
    UNIQUE (client_id, slug)
  );

  CREATE TABLE users (
    id                   TEXT PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name                 TEXT NOT NULL,
    role                 TEXT NOT NULL CHECK (role IN ('admin', 'investigator', 'client')),
    client_id            TEXT REFERENCES clients(id),
    password_hash        TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    totp_secret          TEXT,
    totp_enabled_at      TEXT,
    totp_last_step       INTEGER,
    failed_logins        INTEGER NOT NULL DEFAULT 0,
    locked_until         TEXT,
    last_login_at        TEXT,
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    disabled_at          TEXT,
    -- Client users belong to exactly one client; 365 SMG staff belong to none.
    CHECK ((role = 'client') = (client_id IS NOT NULL))
  );

  CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mfa_passed   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    ip           TEXT,
    user_agent   TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  -- The composite key makes the database itself reject a site from another client.
  CREATE TABLE feedback (
    id         TEXT PRIMARY KEY,
    client_id  TEXT NOT NULL REFERENCES clients(id),
    site_id    TEXT,
    user_id    TEXT NOT NULL REFERENCES users(id),
    topic      TEXT NOT NULL,
    message    TEXT NOT NULL,
    call_back  INTEGER NOT NULL DEFAULT 0,
    reply_by   TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'closed')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (client_id, site_id) REFERENCES sites(client_id, id)
  );
  CREATE INDEX feedback_client ON feedback(client_id, created_at);

  CREATE TABLE investigations (
    id             TEXT PRIMARY KEY,
    case_ref       TEXT NOT NULL UNIQUE,
    client_id      TEXT NOT NULL REFERENCES clients(id),
    user_id        TEXT NOT NULL REFERENCES users(id),
    type           TEXT NOT NULL,
    timeline       TEXT NOT NULL CHECK (timeline IN ('standard', 'urgent')),
    location       TEXT NOT NULL DEFAULT '',
    description    TEXT NOT NULL,
    contact_method TEXT NOT NULL CHECK (contact_method IN ('phone', 'email')),
    status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'closed')),
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX investigations_client ON investigations(client_id, created_at);

  CREATE TABLE audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    actor_id  TEXT,
    client_id TEXT,
    action    TEXT NOT NULL,
    target    TEXT,
    ip        TEXT,
    detail    TEXT
  );
  CREATE INDEX audit_at ON audit_log(at);

  -- The audit log is append-only.
  CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  `,
  `
  -- Live alerts from public feeds (NWS first), and which client sites each one affects.
  CREATE TABLE alerts (
    id            TEXT PRIMARY KEY,           -- source:native id
    source        TEXT NOT NULL,              -- 'nws'
    event         TEXT NOT NULL,
    severity      TEXT NOT NULL CHECK (severity IN ('HIGH', 'MED', 'LOW')),
    headline      TEXT NOT NULL,
    url           TEXT NOT NULL,
    area          TEXT,
    starts_at     TEXT,
    ends_at       TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE site_alerts (
    alert_id    TEXT NOT NULL REFERENCES alerts(id),
    client_id   TEXT NOT NULL,
    site_id     TEXT NOT NULL,
    distance_mi REAL,
    PRIMARY KEY (alert_id, site_id),
    FOREIGN KEY (client_id, site_id) REFERENCES sites(client_id, id) ON DELETE CASCADE
  );
  CREATE INDEX site_alerts_client ON site_alerts(client_id);
  CREATE INDEX site_alerts_site ON site_alerts(site_id);

  CREATE TABLE feed_status (
    source   TEXT PRIMARY KEY,
    ok_at    TEXT,
    error_at TEXT,
    error    TEXT
  );
  `,
  `
  -- Where an alert happened (point feeds such as police calls), and geocoding results.
  ALTER TABLE alerts ADD COLUMN lat REAL;
  ALTER TABLE alerts ADD COLUMN lng REAL;

  CREATE TABLE geocode_cache (
    query TEXT PRIMARY KEY,
    lat   REAL,  -- NULL: no match
    lng   REAL,
    at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
]

export function migrate(db) {
  const version = db.pragma('user_version', { simple: true })
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

/** Opens (and migrates) a database. Pass ':memory:' in tests. */
export function openDatabase(file) {
  const target = file ?? path.join(dataDir(), 'portal.db')
  if (target !== ':memory:') mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 })
  const db = new Database(target)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}

// Passwords: scrypt, N=2^15, r=8, p=1, 32-byte salt. Stored as scrypt$N$r$p$salt$hash.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPassword(password) {
  const salt = randomBytes(32)
  const key = await scryptAsync(password.normalize('NFKC'), salt, 64, SCRYPT)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  })
  return timingSafeEqual(key, expected)
}

/** A readable one-time password, e.g. "kite-4821-RIVER-glow". */
export function temporaryPassword() {
  const words = ['amber', 'birch', 'cedar', 'delta', 'ember', 'falcon', 'glade', 'harbor', 'island', 'jasper',
    'kestrel', 'lantern', 'meadow', 'north', 'orchid', 'pine', 'quartz', 'river', 'summit', 'timber']
  const pick = () => words[randomBytes(1)[0] % words.length]
  const digits = String(1000 + (randomBytes(2).readUInt16BE(0) % 9000))
  return `${pick()}-${digits}-${pick().toUpperCase()}-${pick()}`
}

export const newId = () => randomUUID()

export function audit(db, entry) {
  db.prepare(
    `INSERT INTO audit_log (actor_id, client_id, action, target, ip, detail)
     VALUES (@actorId, @clientId, @action, @target, @ip, @detail)`,
  ).run({
    actorId: entry.actorId ?? null,
    clientId: entry.clientId ?? null,
    action: entry.action,
    target: entry.target ?? null,
    ip: entry.ip ?? null,
    detail: entry.detail ? JSON.stringify(entry.detail) : null,
  })
}
