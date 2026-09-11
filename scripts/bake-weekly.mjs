#!/usr/bin/env node
// Bakes a published weekly schedule into public/demo.mjs.
//   node scripts/bake-weekly.mjs weekly-finnair.json
// Input: an array (or {services:[...], newAirports:[...]}) of weekly services
//   {number, from, to, departure:"HH:MM", arrival:"HH:MM", nextDay, days:"#"|"①③⑤", aircraft, source}
// Local clock times are stamped onto the reference week starting Monday 14 September 2026 with the offset each
// airport's zone has on that date, so the sheet's timestamps stay valid ISO with explicit offsets.
import {readFile, writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';
import {ZONES} from './zones.mjs';

const input = JSON.parse(await readFile(process.argv[2], 'utf8'));
const services = Array.isArray(input) ? input : input.services || input.flights || [];
const extra = (Array.isArray(input) ? [] : input.newAirports || []);
const WEEK_MONDAY = '2026-09-14';
const DAY_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];

const known = new Map([...demo.airports, ...demo.codeshareAirports, ...extra].map(a => [a.code, a]));
const offsetAt = (zone, date, time) => {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(guess)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const minutes = Math.round((local - guess) / 60000), sign = minutes < 0 ? '-' : '+', abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const firstDay = days => days === '#' || !days ? 0 : Math.max(0, DAY_MARKS.findIndex(m => days.includes(m)));

const flights = [], skipped = new Set(), incomplete = [];
for (const s of services) {
  const from = String(s.from).toUpperCase(), to = String(s.to).toUpperCase();
  if (!known.has(from) || !ZONES[from]) { skipped.add(from); continue; }
  if (!known.has(to) || !ZONES[to]) { skipped.add(to); continue; }
  if (!s.departure || !s.arrival) { incomplete.push(`${s.number} ${from}-${to}`); continue; }
  const number = String(s.number).replace(/^([A-Z0-9]{2})\s*0*(\d+)/i, (m, c, n) => `${c.toUpperCase()}${n}`);
  const days = s.days && s.days !== 'daily' ? s.days : '#';
  const depDate = addDays(WEEK_MONDAY, firstDay(days));
  const arrDate = s.nextDay ? addDays(depDate, 1) : depDate;
  const departure = `${depDate}T${s.departure}:00${offsetAt(ZONES[from], depDate, s.departure)}`;
  const arrival = `${arrDate}T${s.arrival}:00${offsetAt(ZONES[to], arrDate, s.arrival)}`;
  if (Date.parse(arrival) <= Date.parse(departure)) { incomplete.push(`${number} ${from}-${to} arrival before departure`); continue; }
  flights.push({id: `${number}-${depDate}-${from}-${to}`, number, from, to, departure, arrival, aircraft: String(s.aircraft || 'Airbus A320').split(' / ')[0].trim(), airline: 'Finnair', status: 'Scheduled', days});
}
const seen = new Map();
for (const f of flights) { const key = `${f.number}|${f.from}|${f.to}|${f.departure.slice(11, 16)}`; if (!seen.has(key)) seen.set(key, f); }
const weekly = [...seen.values()].sort((a, b) => a.departure.localeCompare(b.departure) || a.number.localeCompare(b.number));
const codes = [...new Set(weekly.flatMap(f => [f.from, f.to]))].sort();
const airports = codes.map(c => { const {code, name, alt, lat, lon, zone} = known.get(c); return {code, name, ...(alt ? {alt} : {}), lat, lon, ...(zone !== undefined ? {zone} : {})}; });
const hubs = new Set(codes);
const codeshareAirports = demo.codeshareAirports.filter(a => hubs.has(a.hub));
const csCodes = new Set(codeshareAirports.map(a => a.code));
const codeshareFlights = demo.codeshareFlights.filter(f => (csCodes.has(f.from) && hubs.has(f.to)) || (csCodes.has(f.to) && hubs.has(f.from)));
const sources = [...new Set(services.map(s => { try { return new URL(s.source).hostname; } catch { return String(s.source || '').split(' ')[0]; } }).filter(Boolean))];

await writeFile('public/demo.mjs', `// Finnair weekly network sheet, baked by scripts/bake-weekly.mjs from published schedule pages
// (${sources.join(', ') || 'public schedule pages'}) for the week of ${WEEK_MONDAY}: ${weekly.length} weekly services between ${airports.length} airports.
// Times are local clock times with each airport's offset on that date. Partner connections at oneworld hubs are
// illustrative highlights, not a feed.

export const airports = ${JSON.stringify(airports, null, 2)};

export const flights = ${JSON.stringify(weekly, null, 2)};

export const codeshareAirports = ${JSON.stringify(codeshareAirports, null, 2)};

export const codeshareFlights = ${JSON.stringify(codeshareFlights, null, 2)};

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
console.log(`baked ${weekly.length} weekly services over ${airports.length} airports; ${codeshareAirports.length} partner airports, ${codeshareFlights.length} partner flights`);
if (skipped.size) console.log(`skipped airports without coordinates or zone: ${[...skipped].sort().join(' ')}`);
if (incomplete.length) console.log(`skipped ${incomplete.length} services with missing or impossible times, e.g. ${incomplete.slice(0, 5).join('; ')}`);
