#!/usr/bin/env node
// One-off correction pass over public/demo.mjs, run after verifying the network against Finavia's
// public flight feed (scripts/finavia.mjs) and published route filings:
//
//   node scripts/correct-network.mjs
//
// Every change below carries the source that justifies it. Finnair's own timetable pages are behind
// Akamai and answer 403 to any automated client, so the evidence is Finavia's live movement data for
// anything touching Finland plus aeroroutes schedule filings and route announcements for the rest.
//
// The sheet's shape is a hub network with tag legs: a flight that continues beyond its first stop is
// drawn as two legs sharing one flight number, the way Vaasa–Umeå already was. Four of those exist.
import {readFile, writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';
import {ZONES} from './zones.mjs';

const WEEK_MONDAY = '2026-09-14';
const DAY_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];

const offsetAt = (zone, date, time) => {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(guess)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const minutes = Math.round((local - guess) / 60000), sign = minutes < 0 ? '-' : '+', abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const firstDay = days => days === '#' || !days ? 0 : Math.max(0, DAY_MARKS.findIndex(m => days.includes(m)));

// Builds one weekly service from local clock times, stamping them on the reference week with the
// offset each airport's zone has on that date, exactly as scripts/bake-weekly.mjs does.
function service({number, from, to, departure, arrival, nextDay, days = '#', aircraft, ...rest}) {
  const depDate = addDays(WEEK_MONDAY, firstDay(days)), arrDate = nextDay ? addDays(depDate, 1) : depDate;
  return {
    id: `${number}-${depDate}-${from}-${to}`, number, from, to,
    departure: `${depDate}T${departure}:00${offsetAt(ZONES[from], depDate, departure)}`,
    arrival: `${arrDate}T${arrival}:00${offsetAt(ZONES[to], arrDate, arrival)}`,
    aircraft, airline: 'Finnair', status: 'Scheduled', days, ...rest
  };
}

// ---------------------------------------------------------------------------------------------
// Airports the sheet was missing. All four were being dropped silently by scripts/finavia.mjs for
// want of coordinates, even though scripts/zones.mjs already knew their time zones.
const NEW_AIRPORTS = [
  {code: 'ALF', name: 'Alta', lat: 69.976, lon: 23.372, zone: 2},
  {code: 'CFU', name: 'Korfu', alt: 'Kerkyra', lat: 39.602, lon: 19.912, zone: 3},
  {code: 'KKN', name: 'Kirkkoniemi', alt: 'Kirkenes', lat: 69.726, lon: 29.891, zone: 2},
  {code: 'MEL', name: 'Melbourne', alt: 'Tullamarine', lat: -37.673, lon: 144.843, zone: 10},
  {code: 'PVK', name: 'Preveza', alt: 'Aktion, Lefkas', lat: 38.925, lon: 20.765, zone: 3}
];

// Helsinki Airport was officially Seutula until it was renamed Helsinki-Vantaa in 1977, so the sheet's
// own 1974 reference would have said Seutula under the city name. The hub already prints its alt line
// beneath the title, so the period name costs nothing but a field.
const AIRPORT_NAMES = {HEL: {alt: 'Helsingfors · Seutula'}};

// ---------------------------------------------------------------------------------------------
// Services to remove, by flight number and city pair.
const REMOVE = [
  // Tromsø is not a Helsinki nonstop. Finavia's feed has no AY945/946 movement at all; the service
  // is AY541/542 continuing beyond Rovaniemi, added below.
  ['AY945', 'HEL', 'TOS'], ['AY946', 'TOS', 'HEL']
];

// ---------------------------------------------------------------------------------------------
// Services to add.
const ADD = [
  // Rovaniemi–Tromsø tag. Times as Finavia reported them on 12 and 13 September 2026; the days
  // follow the AY541 Helsinki–Rovaniemi leg already on the sheet, and match the 5-weekly frequency
  // in the NS26 filing that moved this routing from winter-only to summer.
  {number: 'AY541', from: 'RVN', to: 'TOS', departure: '09:45', arrival: '09:45', days: '①②③⑥⑦', aircraft: 'ATR 72'},
  {number: 'AY542', from: 'TOS', to: 'RVN', departure: '10:50', arrival: '12:50', days: '①②③⑥⑦', aircraft: 'ATR 72'},

  // Ivalo–Kirkenes tag, two rotations a day. Times from Finavia's 12 September movements, which
  // carry both ends of each leg, so these are real rather than estimated.
  {number: 'AY611', from: 'IVL', to: 'KKN', departure: '10:45', arrival: '10:20', days: '③④⑥', aircraft: 'ATR 72'},
  {number: 'AY612', from: 'KKN', to: 'IVL', departure: '10:40', arrival: '12:15', days: '③④⑥', aircraft: 'ATR 72'},
  {number: 'AY613', from: 'IVL', to: 'KKN', departure: '19:05', arrival: '18:40', days: '①⑥⑦', aircraft: 'ATR 72'},
  {number: 'AY614', from: 'KKN', to: 'IVL', departure: '19:00', arrival: '20:35', days: '①⑥⑦', aircraft: 'ATR 72'},

  // Kittilä–Alta tag, 5 weekly on the NS26 filing. Finavia sees the Alta end only as an estimated
  // back-calculation from the Helsinki arrival, so these two legs are a reconstruction and say so
  // in their status rather than pretending to be observed times.
  {number: 'AY591', from: 'KTT', to: 'ALF', departure: '09:00', arrival: '09:05', days: '①③⑦', aircraft: 'ATR 72', status: 'Times estimated'},
  {number: 'AY592', from: 'ALF', to: 'KTT', departure: '09:35', arrival: '11:40', days: '①③⑦', aircraft: 'ATR 72', status: 'Times estimated'},

  // Corfu and Preveza, both in Finavia's live feed on Saturday 12 September 2026 under Finnair's
  // AY2xxx leisure numbering. Neither airport was on the sheet at all.
  {number: 'AY2081', from: 'HEL', to: 'CFU', departure: '07:00', arrival: '10:20', days: '⑥', aircraft: 'Airbus A319'},
  {number: 'AY2082', from: 'CFU', to: 'HEL', departure: '11:20', arrival: '14:40', days: '⑥', aircraft: 'Airbus A319'},
  {number: 'AY2095', from: 'HEL', to: 'PVK', departure: '17:10', arrival: '20:35', days: '⑥', aircraft: 'Airbus A321'},
  {number: 'AY2096', from: 'PVK', to: 'HEL', departure: '21:30', arrival: '00:55', nextDay: true, days: '⑥', aircraft: 'Airbus A321'},

  // Osaka's second rotation had a return leg with no outbound. AY069 pairs with the AY070 already on
  // the sheet; the NS26 filing puts this rotation at 3 weekly from 30 June, but does not name the
  // days, so it keeps AY070's single day rather than inventing two more.
  {number: 'AY69', from: 'HEL', to: 'KIX', departure: '17:45', arrival: '12:35', nextDay: true, days: '⑤', aircraft: 'Airbus A350-900'},

  // Melbourne, opening 25 October 2026: AY145/146 continue beyond Bangkok on the same number, and
  // the Bangkok–Melbourne sector is a fifth freedom that sells on its own. Outside this sheet's week,
  // so both legs are marked as opening later and drawn in the dotted ink for a route not yet flying.
  {number: 'AY145', from: 'HEL', to: 'BKK', departure: '00:10', arrival: '16:30', days: '#', aircraft: 'Airbus A350-900', opens: '2026-10-25'},
  {number: 'AY145', from: 'BKK', to: 'MEL', departure: '18:15', arrival: '07:15', nextDay: true, days: '#', aircraft: 'Airbus A350-900', opens: '2026-10-25', fifthFreedom: true},
  {number: 'AY146', from: 'MEL', to: 'BKK', departure: '15:35', arrival: '20:45', days: '#', aircraft: 'Airbus A350-900', opens: '2026-10-25', fifthFreedom: true},
  {number: 'AY146', from: 'BKK', to: 'HEL', departure: '22:30', arrival: '06:05', nextDay: true, days: '#', aircraft: 'Airbus A350-900', opens: '2026-10-25'}
];

// ---------------------------------------------------------------------------------------------
// Partner connections to add. Melbourne is the one airport on the sheet reachable both ways: on
// Finnair's own metal beyond Bangkok from 25 October, and today as a Qantas codeshare beyond
// Singapore, alongside the rest of the Australian cluster already drawn there. Times follow the
// published QF 35/36 rotation and are illustrative, like every other partner leg on this sheet.
const ADD_CODESHARE = [
  {id: 'AY5940a-2026-09-10', number: 'AY 5940', from: 'SIN', to: 'MEL', departure: '2026-09-10T20:35:00+08:00', arrival: '2026-09-11T06:05:00+10:00',
   airline: 'Finnair (op. by Qantas)', operator: 'Qantas', operatorFlight: 'QF 36', aircraft: 'Airbus A330-300', days: '#', frequency: 'Daily (#)', codeshare: true, via: 'SIN'},
  {id: 'AY5940b-2026-09-10', number: 'AY 5941', from: 'MEL', to: 'SIN', departure: '2026-09-10T14:15:00+10:00', arrival: '2026-09-10T20:00:00+08:00',
   airline: 'Finnair (op. by Qantas)', operator: 'Qantas', operatorFlight: 'QF 35', aircraft: 'Airbus A330-300', days: '#', frequency: 'Daily (#)', codeshare: true, via: 'SIN'}
];

// ---------------------------------------------------------------------------------------------
// Marks applied to services already on the sheet.
const MARK = flight => {
  // Doha is suspended: Finnair's own travel notice and the absence of any AY198x movement from the
  // live feed agree, and reporting dated 6 September 2026 has it still not flying.
  if (flight.from === 'DOH' || flight.to === 'DOH') return {suspended: true, suspendedSince: '2026-02-28'};
  // Finnair operates no 737s of its own. Every 737-800 on the sheet is the Jettime wet-lease.
  if (/737/.test(flight.aircraft || '')) return {wetlease: 'Jettime'};
  return null;
};

// ---------------------------------------------------------------------------------------------
const removed = new Set(REMOVE.map(r => r.join('|')));
const kept = demo.flights.filter(f => !removed.has([f.number, f.from, f.to].join('|')));
if (kept.length + REMOVE.length !== demo.flights.length) {
  const gone = demo.flights.length - kept.length;
  console.warn(`warning: ${REMOVE.length} removals matched ${gone} services`);
}
const marked = kept.map(f => { const extra = MARK(f); return extra ? {...f, ...extra} : f; });
const added = ADD.map(service);
const byId = new Map([...marked, ...added].map(f => [f.id, f]));
const flights = [...byId.values()].sort((a, b) => a.departure.localeCompare(b.departure) || a.number.localeCompare(b.number));

const known = new Map([...demo.airports, ...NEW_AIRPORTS].map(a => [a.code, {...a, ...AIRPORT_NAMES[a.code]}]));
const codes = [...new Set(flights.flatMap(f => [f.from, f.to]))].sort();
const missing = codes.filter(c => !known.has(c));
if (missing.length) throw Error(`no coordinates for ${missing.join(' ')}`);
const airports = codes.map(c => { const {code, name, alt, lat, lon, zone} = known.get(c); return {code, name, ...(alt ? {alt} : {}), lat, lon, ...(zone !== undefined ? {zone} : {})}; });

const csIds = new Set(demo.codeshareFlights.map(f => f.id));
const codeshareFlights = [...demo.codeshareFlights, ...ADD_CODESHARE.filter(f => !csIds.has(f.id))];

const source = await readFile('public/demo.mjs', 'utf8');
const header = source.slice(0, source.indexOf('export const airports'));
await writeFile('public/demo.mjs', header
  .replace(/\d+ weekly services between \d+ airports/, `${flights.length} weekly services between ${airports.length} airports`)
  + `export const airports = ${JSON.stringify(airports, null, 2)};

export const flights = ${JSON.stringify(flights, null, 2)};

export const codeshareAirports = ${JSON.stringify(demo.codeshareAirports, null, 2)};

export const codeshareFlights = ${JSON.stringify(codeshareFlights, null, 2)};

export default {
  codeshareAirports,
  codeshareFlights,
  title: "Finnair, by air",
  logo: "finnair-1968",
  copyright: "2026 - Olli-Pekka Lehto - ollipekka.lehto@gmail.com",
  subtitle: "Ulkomaan ja kotimaan liikenne — Utrikes- och inrikestrafiken",
  source: "Finnairin viikkoaikataulu julkisista aikataululähteistä / Weekly timetable from published schedules · syksy / autumn 2026",
  demo: true,
  airports,
  flights
};
`);

const counts = {suspended: 0, wetlease: 0, opens: 0};
for (const f of flights) for (const key of Object.keys(counts)) if (f[key]) counts[key]++;
console.log(`corrected to ${flights.length} weekly services over ${airports.length} airports`);
console.log(`added ${added.length}, removed ${demo.flights.length - kept.length}, new airports ${NEW_AIRPORTS.map(a => a.code).join(' ')}`);
console.log(`marks: ${counts.opens} opening later, ${counts.suspended} suspended, ${counts.wetlease} wet-leased`);
console.log(`partner flights ${codeshareFlights.length} over ${demo.codeshareAirports.length} partner airports`);
