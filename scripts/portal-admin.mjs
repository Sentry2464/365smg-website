#!/usr/bin/env node
// Command-line tasks for the portal database. On the VM: sudo smg-admin <command>
//
//   create-staff --email you@365securitymg.com --name "Your Name" [--role admin|investigator]
//       Creates a 365 SMG staff account and prints a one-time password.
//   send-test-email --to someone@365securitymg.com
//       Sends a test message with the portal's mail settings and reports the result.
//   seed-demo
//       Development only: the design's demo client, sites and users.
import { parseArgs } from 'node:util'
import { audit, hashPassword, newId, openDatabase, temporaryPassword } from '../src/server/core.mjs'
import { deliver, mailProvider } from '../src/server/mail.mjs'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'admin' },
    to: { type: 'string' },
  },
})
const command = positionals[0]

if (command === 'send-test-email') {
  if (!values.to) {
    console.error('usage: send-test-email --to someone@example.com')
    process.exit(2)
  }
  const provider = mailProvider()
  if (provider === 'log') {
    console.error('No mail provider is configured (set SMG_MAIL_PROVIDER=graph or SMTP_HOST in /etc/smg-portal.env).')
    process.exit(1)
  }
  try {
    await deliver(
      values.to,
      '365 SMG Client Portal: test email',
      `This is a test message from the 365 SMG Client Portal (${provider}).\nSent ${new Date().toISOString()}.`,
    )
    console.log(`Sent via ${provider} to ${values.to}.`)
    process.exit(0)
  } catch (err) {
    console.error(`Sending failed via ${provider}: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

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

if (command === 'create-staff') {
  const { email, name, role } = values
  if (!email || !name || !['admin', 'investigator'].includes(role)) {
    console.error('usage: create-staff --email you@365securitymg.com --name "Your Name" [--role admin|investigator]')
    process.exit(2)
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    console.error(`A user with email ${email} already exists.`)
    process.exit(1)
  }
  const pass = await addUser({ email, name, role })
  console.log(`Created ${role} ${email}.\nTemporary password (shown once): ${pass}`)
  console.log('Sign in at https://portal.365securitymg.com/portal/login to choose a password and set up two-step login.')
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
      id, name, industry, plural, 'accounts@365smg.test')
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
