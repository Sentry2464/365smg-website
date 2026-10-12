import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../core.mjs'
import { FDLE_ALERTS, inArea, missingList, parseFdleAlerts, pollFdle } from '../fdle'

// Shape of FDLE's AllCurrentAlerts.asp (12 Oct 2026), with placeholder people.
const row = (id: string, since: string, name: string, category: string, from: string) =>
  `<tr><td class="TableDataCell" align="center"><a href="javascript:;" onclick="OpenWindow('Flyer.asp?ID=${id}','WebFlyer','')"><img src="GetImage.asp?FIN=1" width="60" height="70" alt="Click to view Flyer" /></a></td>` +
  `<td class="TableDataCell">${since}</td><td class="TableDataCell"><a href="javascript:;" onclick="OpenWindow('Flyer.asp?ID=${id}')"><u>${name}</u></a></td>` +
  `<td class="TableDataCell">Race: X<br />Sex: X</td><td class="TableDataCell">DOB: 1/1/2010<br />Age: 16 yrs</td>` +
  `<td class="TableDataCell">3 days</td><td class="TableDataCell">${category}</td><td class="TableDataCell">${from}</td></tr>`
const section = (title: string, rows: string[]) =>
  `<font size="4"><b>${title}</b></font>` +
  (rows.length
    ? `<table width="100%" class="DataTable"><tr><th>Click Photo for Flyer</th><th>Missing Since</th></tr>${rows.join('')}</table>`
    : `<p>No ${title.replace('Current ', '')} are active at this time.</p>`)
const page = [
  '<html><body><!-- <b>Current Fake Alerts</b> -->',
  section('Current AMBER Alerts', [row('101', '10/10/2026', 'DOE, JANE', 'Endangered', 'Miami,FL')]),
  section('Current Missing Child - Spectrum Alerts', []),
  section('Current Missing Child Alerts', [
    row('102', '10/11/2026', 'ROE, RICHARD', 'Missing Person', 'Orlando,FL'),
    row('103', '9/1/2026', 'POE, PAT', 'Runaway', 'Pensacola,FL'),
  ]),
  section('Current Silver Alerts', [row('104', '10/12/2026', 'MOE, MO', 'Endangered', 'St.Cloud,FL')]),
  '</body></html>',
].join('')

let db: Database
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('FDLE missing persons alerts', () => {
  it('parses each section, ignoring comments and empty sections', () => {
    const alerts = parseFdleAlerts(page)
    expect(alerts.map((a) => [a.type, a.name, a.from])).toEqual([
      ['AMBER Alert', 'DOE, JANE', 'Miami, FL'],
      ['Missing Child Alert', 'ROE, RICHARD', 'Orlando, FL'],
      ['Missing Child Alert', 'POE, PAT', 'Pensacola, FL'],
      ['Silver Alert', 'MOE, MO', 'St.Cloud, FL'],
    ])
    expect(alerts[1].url).toBe('https://www.fdle.state.fl.us/mcicsearch/Flyer.asp?ID=102')
    expect(JSON.stringify(alerts)).not.toMatch(/DOB|GetImage|Race/) // nothing beyond what we show
    expect(() => parseFdleAlerts('<html>maintenance</html>')).toThrow()
  })

  it('keeps AMBER statewide and others for Central Florida cities, newest first', async () => {
    expect(inArea(parseFdleAlerts(page)).map((a) => a.id)).toEqual(['101', '102', '104'])
    expect(missingList(db)).toBeNull()
    const serve = (async (url: string) => {
      expect(url).toBe(FDLE_ALERTS)
      return new Response(page, { headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch
    await pollFdle(db, serve)
    expect(missingList(db)!.alerts.map((a) => a.id)).toEqual(['104', '102', '101'])
  })
})
