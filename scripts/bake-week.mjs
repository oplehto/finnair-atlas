#!/usr/bin/env node
// Bakes a weekly Finnair sheet into public/demo.mjs from a Finavia snapshot (scripts/finavia.mjs output):
// real routes, times and aircraft from the snapshot; days of operation from the previous demo entry with
// the same flight number (the season pattern), daily otherwise. Partner connections are kept as they are.
//   node scripts/bake-week.mjs snapshot.json
import {readFile, writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';

const snapshot = JSON.parse(await readFile(process.argv[2], 'utf8'));
const pattern = new Map(demo.flights.map(f => [f.number.replace(/\s+/g, ''), f]));
const known = new Map([...demo.airports, ...demo.codeshareAirports].map(a => [a.code, a]));

const flights = snapshot.flights.map(f => {
  const previous = pattern.get(f.number.replace(/\s+/g, ''));
  const days = previous?.days || '#';
  return {id: f.id, number: f.number, from: f.from, to: f.to, departure: f.departure, arrival: f.arrival, aircraft: f.aircraft || previous?.aircraft || 'Airbus A320', airline: 'Finnair', status: /estimated/i.test(f.status) ? f.status : 'Scheduled', days, ...(f.operatorFlight ? {operatorFlight: f.operatorFlight} : {})};
});
// Services the season pattern says do not operate on the sampled weekday cannot appear in a one-day
// snapshot; keep them from the previous sheet so the week stays complete (MIA, seasonal Mediterranean routes).
const DAY_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
const sampledDay = DAY_MARKS[(new Date((snapshot.source.match(/fetched (\d{4}-\d{2}-\d{2})/) || snapshot.source.match(/(\d{4}-\d{2}-\d{2})/))[1] + 'T12:00:00Z').getUTCDay() + 6) % 7];
const seenNumbers = new Set(flights.map(f => f.number.replace(/\s+/g, '')));
let restored = 0;
for (const f of demo.flights) {
  if (seenNumbers.has(f.number.replace(/\s+/g, ''))) continue;
  if (!f.days || f.days === '#' || f.days.includes(sampledDay)) continue;
  flights.push({...f, status: 'Scheduled'}); restored++;
}
// one entry per weekly service: number, route and departure clock time
const seen = new Map();
for (const f of flights) { const key = `${f.number}|${f.from}|${f.to}|${f.departure.slice(11, 16)}`; if (!seen.has(key)) seen.set(key, f); }
const weekly = [...seen.values()].sort((a, b) => a.departure.localeCompare(b.departure) || a.number.localeCompare(b.number));
const codes = [...new Set(weekly.flatMap(f => [f.from, f.to]))].sort();
const airports = codes.map(c => { const a = known.get(c); if (!a) throw Error('no coordinates for ' + c); const {code, name, alt, lat, lon, zone} = a; return {code, name, ...(alt ? {alt} : {}), lat, lon, ...(zone !== undefined ? {zone} : {})}; });
// partner satellites whose gateway is no longer on the sheet would dangle; keep only those whose hub is present
const hubs = new Set(codes);
const codeshareAirports = demo.codeshareAirports.filter(a => hubs.has(a.hub));
const csCodes = new Set(codeshareAirports.map(a => a.code));
const codeshareFlights = demo.codeshareFlights.filter(f => (csCodes.has(f.from) && hubs.has(f.to)) || (csCodes.has(f.to) && hubs.has(f.from)));

const fetched = (snapshot.source.match(/fetched ([^ ]+ [^ ]+)Z/) || [])[1] || '';
const withPattern = weekly.filter(f => pattern.has(f.number.replace(/\s+/g, ''))).length;
const body = `// Finnair weekly network sheet, baked from Finavia public flight information (snapshot ${fetched}Z) by
// scripts/bake-week.mjs: routes, times and aircraft are from that day's schedule at Finnish airports; days of
// operation follow the season pattern per flight number (${withPattern} of ${weekly.length} services), daily otherwise;
// ${restored} services that the pattern says do not fly on the sampled weekday (${sampledDay}) are kept from the previous sheet.
// Times at foreign airports are estimated from distance where the feed only had the Finnish end (see status).
// Partner connections at oneworld hubs are illustrative highlights, not a feed.

export const airports = ${JSON.stringify(airports, null, 2)};

export const flights = ${JSON.stringify(weekly, null, 2)};

export const codeshareAirports = ${JSON.stringify(codeshareAirports, null, 2)};

export const codeshareFlights = ${JSON.stringify(codeshareFlights, null, 2)};

export default {
  codeshareAirports,
  codeshareFlights,
  title: "Finnair, by air",
  logo: "finnair-1968",
  copyright: "Olli-Pekka Lehto",
  subtitle: "Ulkomaan ja kotimaan liikenne — Utrikes- och inrikestrafiken",
  source: "Finnairin viikkoaikataulu Finavian lentotiedoista / Weekly pattern from Finavia flight data · syksy / autumn 2026",
  demo: true,
  airports,
  flights
};
`;
await writeFile('public/demo.mjs', body);
console.log(`restored ${restored} services not operating on ${sampledDay}; baked ${weekly.length} weekly services over ${airports.length} airports (${withPattern} with season day marks), ${codeshareAirports.length} partner airports, ${codeshareFlights.length} partner flights`);
