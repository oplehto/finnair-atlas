#!/usr/bin/env node
// Replaces the sheet's own services on one or more city pairs with every published row covering the
// sheet's week, read from the Finnair route pages, and records where each service came from:
//
//   node scripts/correct-from-routes.mjs HEL-SVG            # both directions of one pair
//   node scripts/correct-from-routes.mjs HEL-SVG HEL-BGO
//
// Use this where the collected week and the published schedule disagree. Stavanger was the first
// case: the sheet drew one of the four daily rotations and got the return's time and aircraft wrong,
// because an earlier research pass reported Stavanger as a tag via Stockholm. The route pages say
// plainly "Direct Flights ... Non-stop", on Finnair's own A319 and A320.
import {readFile, writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';
import {ZONES} from './zones.mjs';
import {fetchRoute, flatten, parseRows} from './flightmapper.mjs';

const WEEK = '2026-09-14';
const SOURCE = 'flightmapper.net Finnair route page';
const DAY_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];

const pairs = process.argv.slice(2).map(s => s.toUpperCase().split('-'));
if (!pairs.length || pairs.some(p => p.length !== 2)) { console.error('usage: node scripts/correct-from-routes.mjs HEL-SVG [HEL-BGO ...]'); process.exit(1); }

const offsetAt = (zone, date, time) => {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(guess)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const minutes = Math.round((local - guess) / 60000), sign = minutes < 0 ? '-' : '+', abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const firstDay = marks => marks === '#' ? 0 : Math.max(0, DAY_MARKS.findIndex(m => marks.includes(m)));

const touched = new Set(pairs.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
const kept = demo.flights.filter(f => !touched.has(`${f.from}|${f.to}`));
const removed = demo.flights.length - kept.length;

const added = [];
for (const [a, b] of pairs) {
  for (const [from, to] of [[a, b], [b, a]]) {
    const {chosen, coveredWeek} = parseRows(flatten(await fetchRoute(from, to)), from, to, WEEK);
    if (!chosen.length) { console.log(`${from}-${to}: nothing published, left out`); continue; }
    for (const row of chosen) {
      if (row.operatorFlight) continue; // a partner leg belongs in the codeshare pass, not here
      const depDate = addDays(WEEK, firstDay(row.marks));
      const arrDate = row.nextDay ? addDays(depDate, 1) : depDate;
      const id = `${row.ay}-${depDate}-${from}-${to}`;
      if (kept.some(f => f.id === id) || added.some(f => f.id === id)) continue;
      added.push({
        id, number: row.ay, from, to,
        departure: `${depDate}T${row.dep}:00${offsetAt(ZONES[from], depDate, row.dep)}`,
        arrival: `${arrDate}T${row.arr}:00${offsetAt(ZONES[to], arrDate, row.arr)}`,
        aircraft: row.aircraft || undefined, airline: 'Finnair',
        status: coveredWeek ? 'Scheduled' : 'Times from the nearest published period, not this week',
        days: row.marks, source: SOURCE
      });
    }
  }
}

const flights = [...kept, ...added].sort((x, y) => (x.departure || '9999').localeCompare(y.departure || '9999') || (x.number || '').localeCompare(y.number || '') || x.id.localeCompare(y.id));
const codes = [...new Set(flights.flatMap(f => [f.from, f.to]))];
const airports = demo.airports.filter(a => codes.includes(a.code));

const source = await readFile('public/demo.mjs', 'utf8');
const head = source.slice(0, source.indexOf('export const airports'));
const tail = source.slice(source.indexOf('export const codeshareAirports'));
await writeFile('public/demo.mjs', head
  .replace(/\d+ weekly services between \d+ airports/, `${flights.length} weekly services between ${airports.length} airports`)
  + `export const airports = ${JSON.stringify(airports, null, 2)};

export const flights = ${JSON.stringify(flights, null, 2)};

` + tail);

console.log(`${pairs.map(p => p.join('-')).join(', ')}: replaced ${removed} service(s) with ${added.length} from published rows`);
for (const f of added) console.log(`  ${f.number} ${f.from}-${f.to} ${f.departure.slice(11, 16)}→${f.arrival.slice(11, 16)} ${f.days} ${f.aircraft || '?'}`);
console.log(`${flights.length} services over ${airports.length} airports`);
