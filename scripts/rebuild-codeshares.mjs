#!/usr/bin/env node
// Rebuilds the sheet's partner connections from published Finnair route pages:
//
//   node scripts/rebuild-codeshares.mjs
//
// The sheet draws a selection of partner connections at each gateway hub, not the whole network —
// Dallas alone carries 82 Finnair-coded destinations. The selection below is deliberate: the most
// important destination in each region a gateway opens up, so each grid reads as a map of what that
// hub is for rather than a list. Membership came from scripts/discover-network.mjs, which walks the
// published Finnair flight index; every flight number, time and aircraft here is read from that
// gateway's route page by scripts/flightmapper.mjs, never assumed.
//
// The previous selection was invented. An audit (scripts/verify-codeshares.mjs) found that none of
// its 142 legs matched published data and 47 were sectors Finnair places no code on at all, among
// them Singapore to Adelaide, Cairns, Auckland and Christchurch, and all five London–Caribbean
// routes. Australia and New Zealand move to Hong Kong, where Cathay Pacific actually carries them.
import {writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';
import {ZONES} from './zones.mjs';
import {fetchRoute, flatten, principalRow} from './flightmapper.mjs';

const WEEK = '2026-09-14';

// Gateway → the destinations drawn from it, one per region it opens up.
const SELECTION = {
  HKG: {partner: 'Cathay Pacific', region: 'east', codes: ['SYD', 'AKL', 'DPS', 'MNL', 'PEN', 'CEB']},
  SIN: {partner: 'Qantas', region: 'east', codes: ['MEL', 'DRW', 'NAN', 'KUL', 'HAN', 'USM', 'CMB']},
  DOH: {partner: 'Qatar Airways', region: 'east', codes: ['AMM', 'JED', 'MCT', 'ALA', 'NBO', 'ZNZ', 'JNB', 'CPT', 'MLE', 'SEZ']},
  HND: {partner: 'Japan Airlines', region: 'east', codes: ['CTS', 'FUK', 'OKA']},
  LHR: {partner: 'British Airways', region: 'west', codes: ['GLA', 'INV', 'NCL', 'JER', 'GIB', 'BOS', 'IAD', 'YYZ', 'GRU', 'LOS']},
  JFK: {partner: 'American Airlines', region: 'west', codes: ['CLT', 'RDU', 'DCA', 'ORF']},
  ORD: {partner: 'American Airlines', region: 'west', codes: ['MSP', 'DTW', 'STL', 'BNA']},
  DFW: {partner: 'American Airlines', region: 'west', codes: ['MEX', 'AUS', 'CUN']},
  LAX: {partner: 'American Airlines', region: 'west', codes: ['SFO', 'LAS', 'PHX', 'HNL']},
  SEA: {partner: 'Alaska Airlines', region: 'west', codes: ['ANC', 'PDX']}
};

// Destinations the sheet has not drawn before and so has no coordinates for.
const NEW_AIRPORTS = {
  CEB: {name: 'Cebu', alt: 'Mactan', lat: 10.307, lon: 123.979},
  NAN: {name: 'Nadi', alt: 'Fiji', lat: -17.755, lon: 177.443},
  USM: {name: 'Koh Samui', alt: 'Thailand', lat: 9.548, lon: 100.062},
  ALA: {name: 'Almaty', alt: 'Kazakhstan', lat: 43.352, lon: 77.041},
  INV: {name: 'Inverness', alt: 'Scotland', lat: 57.542, lon: -4.048},
  YYZ: {name: 'Toronto', alt: 'Pearson', lat: 43.677, lon: -79.631},
  GRU: {name: 'São Paulo', alt: 'Guarulhos', lat: -23.435, lon: -46.473},
  DCA: {name: 'Washington', alt: 'Reagan National', lat: 38.852, lon: -77.038},
  ORF: {name: 'Norfolk', alt: 'Virginia', lat: 36.895, lon: -76.201}
};

const known = new Map([...demo.airports, ...demo.codeshareAirports].map(a => [a.code, a]));

const offsetAt = (zone, date, time) => {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(guess)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const minutes = Math.round((local - guess) / 60000), sign = minutes < 0 ? '-' : '+', abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const DAY_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
const firstDay = marks => marks === '#' ? 0 : Math.max(0, DAY_MARKS.findIndex(m => marks.includes(m)));

function leg(from, to, row, partner, suffix) {
  const depDate = addDays(WEEK, firstDay(row.marks));
  const arrDate = row.nextDay ? addDays(depDate, 1) : depDate;
  return {
    id: `${row.ay}${suffix}-${depDate}`,
    number: row.ay.replace(/^AY/, 'AY '),
    from, to,
    departure: `${depDate}T${row.dep}:00${offsetAt(ZONES[from], depDate, row.dep)}`,
    arrival: `${arrDate}T${row.arr}:00${offsetAt(ZONES[to], arrDate, row.arr)}`,
    airline: `Finnair (op. by ${partner})`,
    operator: row.operator && row.operator !== 'JAL' ? row.operator : partner,
    operatorFlight: row.operatorFlight,
    aircraft: row.aircraft || undefined,
    days: row.marks,
    frequency: row.marks === '#' ? 'Daily (#)' : `Weekly (${row.marks})`,
    codeshare: true,
    via: from.length === 3 && SELECTION[from] ? from : to
  };
}

const airports = [], flights = [], gaps = [], alsoOwn = [];
for (const [hub, {partner, region, codes}] of Object.entries(SELECTION)) {
  for (const code of codes) {
    if (!ZONES[code] || !ZONES[hub]) { gaps.push(`${hub}-${code}: no time zone`); continue; }
    const base = known.get(code) || NEW_AIRPORTS[code];
    if (!base) { gaps.push(`${code}: no coordinates, skipped`); continue; }
    const out = principalRow(flatten(await fetchRoute(hub, code)), hub, code, WEEK);
    const back = principalRow(flatten(await fetchRoute(code, hub)), code, hub, WEEK);
    if (!out && !back) { gaps.push(`${hub}-${code}: no published Finnair schedule either way`); continue; }
    if (out) flights.push(leg(hub, code, out, partner, 'a'));
    if (back) flights.push(leg(code, hub, back, partner, 'b'));
    if (!out) gaps.push(`${hub}-${code}: outbound not published`);
    if (!back) gaps.push(`${code}-${hub}: inbound not published`);
    // A destination Finnair also flies itself keeps its own box on the sheet and gains a partner leg
    // beside it. Melbourne is the one that does both: Finnair's own service beyond Bangkok from 25
    // October, and Qantas beyond Singapore today.
    if (demo.airports.some(a => a.code === code)) { alsoOwn.push(code); continue; }
    airports.push({code, name: base.name, ...(base.alt ? {alt: base.alt} : {}), lat: base.lat, lon: base.lon, region, hub, partner, codeshare: true});
  }
}

const ids = new Set();
for (const f of flights) { if (ids.has(f.id)) throw Error(`duplicate flight id ${f.id}`); ids.add(f.id); }
const codes = new Set(airports.map(a => a.code));
if (codes.size !== airports.length) throw Error('duplicate partner airport');

const source = await import('node:fs/promises').then(fs => fs.readFile('public/demo.mjs', 'utf8'));
const head = source.slice(0, source.indexOf('export const airports'));
const mainAirports = source.slice(source.indexOf('export const airports'), source.indexOf('export const codeshareAirports'));
await writeFile('public/demo.mjs', head + mainAirports
  + `export const codeshareAirports = ${JSON.stringify(airports, null, 2)};

export const codeshareFlights = ${JSON.stringify(flights, null, 2)};

export default {
  codeshareAirports,
  codeshareFlights,
  title: "Finnair, by air",
  logo: "finnair-1968",
  copyright: "OPL Consulting Oy",
  subtitle: "Ulkomaan ja kotimaan liikenne — Utrikes- och inrikestrafiken",
  source: "Finnairin viikkoaikataulu julkisista aikataululähteistä / Weekly timetable from published schedules · syksy / autumn 2026",
  demo: true,
  airports,
  flights
};
`);

console.log(`${airports.length} partner airports, ${flights.length} partner legs, all from published route pages`);
for (const [hub, {codes: list}] of Object.entries(SELECTION)) console.log(`  ${hub}: ${list.filter(c => codes.has(c)).join(' ')}`);
if (alsoOwn.length) console.log(`\nalso Finnair's own destinations, so no partner box: ${alsoOwn.join(' ')}`);
if (gaps.length) { console.log(`\n${gaps.length} gap(s):`); for (const g of gaps) console.log(`  ${g}`); }
