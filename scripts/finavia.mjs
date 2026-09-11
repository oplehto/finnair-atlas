#!/usr/bin/env node
// Fetches Finavia's public flight information (all Finnish airports, roughly today and tomorrow) and writes
// it as an Airline Atlas schedule file. Reads the API key from FINAVIA_KEY or ~/finavia and never prints it.
//
//   node scripts/finavia.mjs --out schedule.json            # Finnair services touching Finland
//   node scripts/finavia.mjs --out schedule.json --merge    # add today's flights to an existing file (build a week)
//   node scripts/finavia.mjs --airline all                  # every carrier in the feed
//   SCHEDULE_FILE=$PWD/schedule.json npm start
//
// Finavia gives one scheduled timestamp per movement at a Finnish airport. Domestic legs are seen from both
// ends and get real departure and arrival times. For a foreign end the other time is estimated from the
// great-circle distance and the leg is marked "Arrival estimated" / "Departure estimated".
import {readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import demo from '../public/demo.mjs';
import {ZONES, toLocal} from './zones.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args[a.slice(2)] = next && !next.startsWith('--') ? (i++, next) : true;
}
const airline = String(args.airline || 'AY').toUpperCase();
const base = args.url || process.env.FINAVIA_URL || 'https://apigw.finavia.fi/flights/public/v0';
const out = args.out || 'schedule.json';

const AIRCRAFT = {'320': 'Airbus A320', '319': 'Airbus A319', '321': 'Airbus A321', '32N': 'Airbus A321neo', '32Q': 'Airbus A321neo', '32B': 'Airbus A321', '32A': 'Airbus A320', '359': 'Airbus A350-900', '333': 'Airbus A330-300', '223': 'Airbus A220-300', BCS3: 'Airbus A220-300', E90: 'Embraer 190', E190: 'Embraer 190', E75: 'Embraer E175', AT7: 'ATR 72', AT75: 'ATR 72', AT76: 'ATR 72', '73H': 'Boeing 737-800', B738: 'Boeing 737-800', '7M8': 'Boeing 737 MAX 8', '7S8': 'Boeing 737 MAX 8', '7M9': 'Boeing 737 MAX 9', '789': 'Boeing 787-9', CR9: 'Bombardier CRJ-900', F50: 'Fokker 50', SB20: 'Saab 2000', E120: 'Embraer 120', EM2: 'Embraer 120', E550: 'Embraer Legacy 500'};
const known = new Map([...demo.airports, ...demo.codeshareAirports].map(a => [a.code, {code: a.code, name: a.name, alt: a.alt, lat: a.lat, lon: a.lon}]));
const zone = code => ZONES[code] || null;

async function key() {
  if (process.env.FINAVIA_KEY) return process.env.FINAVIA_KEY.trim();
  return (await readFile(join(homedir(), 'finavia'), 'utf8')).trim();
}

function parse(xml, kind) {
  const section = (xml.match(new RegExp(`<${kind}>([\\s\\S]*?)</${kind}>`)) || [])[1] || '';
  const get = (body, tag) => (body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '';
  return [...section.matchAll(/<flight>([\s\S]*?)<\/flight>/g)].map(([, b]) => ({
    home: get(b, 'h_apt'), number: get(b, 'fltnr').trim(), sdt: get(b, 'sdt'), other: get(b, 'route_1'), otherName: get(b, 'route_n_1'),
    aircraft: get(b, 'actype'), codeshares: [1, 2, 3, 4, 5, 6].map(i => get(b, `cflight_${i}`)).filter(Boolean), status: get(b, 'prt') || 'Scheduled'
  })).filter(f => f.home && f.number && f.sdt && f.other);
}

const km = (a, b) => { const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r, h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const blockMinutes = (a, b) => Math.round((25 + km(a, b) / 13.3) / 5) * 5; // taxi plus ~800 km/h, to 5 minutes
const shift = (utcIso, minutes) => new Date(Date.parse(utcIso) + minutes * 60000).toISOString().replace('.000Z', 'Z');

const apiKey = await key();
const response = await fetch(`${base}/flights/all/all`, {headers: {app_key: apiKey, Accept: 'application/xml'}, signal: AbortSignal.timeout(60000)});
if (!response.ok) throw Error(`Finavia responded ${response.status}`);
const xml = await response.text();
const departures = parse(xml, 'dep'), arrivals = parse(xml, 'arr');
const wanted = f => airline === 'ALL' || f.number.startsWith(airline);

const legs = new Map(), skipped = new Set(), estimated = {arrival: 0, departure: 0};
const arrivalIndex = new Map(arrivals.map(f => [`${f.number}|${f.home}|${f.sdt.slice(0, 10)}`, f]));
const departureIndex = new Map(departures.map(f => [`${f.number}|${f.home}|${f.sdt.slice(0, 10)}`, f]));
const flightNumber = n => n.replace(/^([A-Z0-9]{2})0*(\d+)/, '$1$2');

for (const f of departures.filter(wanted)) {
  const from = f.home, to = f.other, a = known.get(from), b = known.get(to);
  if (!a || !b || !zone(from) || !zone(to)) { skipped.add(!b ? to : from); continue; }
  const date = f.sdt.slice(0, 10);
  const pair = arrivalIndex.get(`${f.number}|${to}|${date}`) || arrivalIndex.get(`${f.number}|${to}|${shift(f.sdt, 1440).slice(0, 10)}`);
  let arrivalUtc = pair?.sdt, status = f.status;
  if (!arrivalUtc) { arrivalUtc = shift(f.sdt, blockMinutes(a, b)); status = 'Arrival estimated'; estimated.arrival++; }
  const id = `${flightNumber(f.number)}-${date}-${from}-${to}`;
  legs.set(id, {id, number: flightNumber(f.number), from, to, departure: toLocal(f.sdt, zone(from)), arrival: toLocal(arrivalUtc, zone(to)), aircraft: AIRCRAFT[f.aircraft] || f.aircraft || undefined, airline: airline === 'AY' ? 'Finnair' : f.number.slice(0, 2), status, ...(f.codeshares.length ? {operatorFlight: f.codeshares.join(', ')} : {})});
}
for (const f of arrivals.filter(wanted)) {
  const from = f.other, to = f.home, a = known.get(from), b = known.get(to);
  if (!a || !b || !zone(from) || !zone(to)) { skipped.add(!a ? from : to); continue; }
  const date = f.sdt.slice(0, 10);
  const dep = departureIndex.get(`${f.number}|${from}|${date}`) || departureIndex.get(`${f.number}|${from}|${shift(f.sdt, -1440).slice(0, 10)}`);
  if (dep) continue; // domestic leg already built from its departure record
  const departureUtc = shift(f.sdt, -blockMinutes(a, b));
  const id = `${flightNumber(f.number)}-${departureUtc.slice(0, 10)}-${from}-${to}`;
  if (legs.has(id)) continue;
  estimated.departure++;
  legs.set(id, {id, number: flightNumber(f.number), from, to, departure: toLocal(departureUtc, zone(from)), arrival: toLocal(f.sdt, zone(to)), aircraft: AIRCRAFT[f.aircraft] || f.aircraft || undefined, airline: airline === 'AY' ? 'Finnair' : f.number.slice(0, 2), status: 'Departure estimated', ...(f.codeshares.length ? {operatorFlight: f.codeshares.join(', ')} : {})});
}

let previous = {flights: []};
if (args.merge) { try { previous = JSON.parse(await readFile(out, 'utf8')); } catch { /* first run */ } }
const merged = new Map((previous.flights || []).map(f => [f.id, f]));
for (const [id, leg] of legs) merged.set(id, leg);
const flights = [...merged.values()].sort((a, b) => a.departure.localeCompare(b.departure));
const codes = [...new Set(flights.flatMap(f => [f.from, f.to]))].sort();
const dates = [...new Set(flights.map(f => f.departure.slice(0, 10)))].sort();
const schedule = {
  title: airline === 'AY' ? 'Finnair, by air' : 'Finland, by air',
  subtitle: 'Finavian julkinen lentotieto — Finavias offentliga flyginformation — Finavia public flight information',
  source: `Finavia public flights API · ${dates[0]}${dates.length > 1 ? ' – ' + dates.at(-1) : ''} · fetched ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`,
  logo: airline === 'AY' ? 'finnair-1968' : undefined,
  copyright: previous.copyright || demo.copyright,
  airports: codes.map(c => known.get(c)),
  flights
};
await writeFile(out, JSON.stringify(schedule, null, 1));
console.log(`Finavia feed: ${departures.length} departures, ${arrivals.length} arrivals; ${legs.size} ${airline} legs today, ${flights.length} in ${out} over ${dates.length} day(s).`);
console.log(`Estimated times: ${estimated.arrival} arrivals abroad, ${estimated.departure} departures abroad (marked in status).`);
if (skipped.size) console.log(`Skipped airports without coordinates or zone: ${[...skipped].sort().join(' ')}`);
