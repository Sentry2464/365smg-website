#!/usr/bin/env node
// Command-line tasks for the portal database. On the VM: sudo smg-admin <command>
//
//   create-staff --email you@365smg.com --name "Your Name" [--role admin|investigator]
//       Creates a 365 SMG staff account and prints a one-time password.
//   seed-demo
//       Development only: the design's demo client, sites and users.
import { parseArgs } from 'node:util'
import { audit, hashPassword, newId, openDatabase, temporaryPassword } from '../src/server/core.mjs'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', default: 'admin' } },
})
const db = openDatabase()

async function addUser({ email, name, role, clientId = null, password }) {
  const pass = password ?? temporaryPassword()
  const id = newId()
  db.prepare(
    `INSERT INTO users (id, email, name, role, client_id, password_hash, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(id, email.toLowerCase(), name, role, clientId, await hashPassword(pass))
  audit(db, { clientId, action: 'user.create', target: id, detail: { role, via: 'cli' } })
  return pass
}

const command = positionals[0]
if (command === 'create-staff') {
  const { email, name, role } = values
  if (!email || !name || !['admin', 'investigator'].includes(role)) {
    console.error('usage: create-staff --email you@365smg.com --name "Your Name" [--role admin|investigator]')
    process.exit(2)
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    console.error(`A user with email ${email} already exists.`)
    process.exit(1)
  }
  const pass = await addUser({ email, name, role })
  console.log(`Created ${role} ${email}.\nTemporary password (shown once): ${pass}`)
  console.log('Sign in at https://portal.365smg.com/portal/login to choose a password and set up two-step login.')
} else if (command === 'seed-demo') {
  if (process.env.NODE_ENV === 'production') {
    console.error('seed-demo is for development only.')
    process.exit(1)
  }
  if (db.prepare('SELECT 1 FROM clients LIMIT 1').get()) {
    console.error('The database already has clients; seed-demo only runs on an empty database.')
    process.exit(1)
  }
  const client = (name, industry, plural) => {
    const id = newId()
    db.prepare('INSERT INTO clients (id, name, industry, industry_plural, manager_email) VALUES (?, ?, ?, ?, ?)').run(
      id, name, industry, plural, 'accounts@365smg.com')
    return id
  }
  const site = (clientId, slug, name, city, lat, lng) =>
    db.prepare('INSERT INTO sites (id, client_id, slug, name, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      newId(), clientId, slug, name, city, lat, lng)
  const rc = client('Royal Cypress Preserve HOA', 'Residential community', 'residential communities')
  site(rc, 'royal-cypress-preserve', 'Royal Cypress Preserve', 'Orlando, FL', 28.4735, -81.5043)
  site(rc, 'lake-nona-commons', 'Lake Nona Commons', 'Orlando, FL', 28.3995, -81.2431)
  const lm = client('Lake Mary Office Park', 'Commercial office', 'commercial offices')
  site(lm, 'lake-mary-office-park', 'Lake Mary Office Park', 'Lake Mary, FL', 28.7589, -81.3178)
  const pw = 'demo-password-2026'
  await addUser({ email: 'admin@365smg.test', name: 'Avery Admin', role: 'admin', password: pw })
  await addUser({ email: 'investigator@365smg.test', name: 'Ivy Investigator', role: 'investigator', password: pw })
  await addUser({ email: 'janet@royalcypress.test', name: 'Janet Morales', role: 'client', clientId: rc, password: pw })
  await addUser({ email: 'sam@lakemary.test', name: 'Sam Patel', role: 'client', clientId: lm, password: pw })
  console.log(`Demo data created. Every demo account starts with the password "${pw}".`)
} else {
  console.error('commands: create-staff, seed-demo')
  process.exit(2)
}
