#!/usr/bin/env node
// Adds the winter 2026/27 destinations to the sheet, marked as opening rather than operating:
//
//   node scripts/add-winter-season.mjs
//
// The sheet's week is 14 September 2026, inside the summer season, which ends on 24 October. The
// winter schedules are not published anywhere reachable yet — every route page stops at that date,
// and the winter routes show only last winter's periods — so these services carry their real AY
// flight numbers, read from those published pages, and no timings at all. Inventing clock times for
// an unpublished season would put fiction on a timetable; the opening date is the honest statement.
//
// 25 October 2026 is the season boundary itself, the date the summer schedules end on and the one
// Finnair's own winter announcements use. Reporting on Miami has suggested a later start within the
// season; if a firmer date appears, it belongs here.
import {readFile, writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';

const OPENS = '2026-10-25';

// One destination per region the winter network opens up, with the flight numbers each route
// actually carries. Salzburg is left out: its page has no Finnair-operated rows to read. Tampere is
// the one entry with no published number at all — the route's return on 25 October is reported but
// not yet filed — so it is drawn as the destination opening, with nothing claimed about its flights.
const WINTER = [
  {code: 'MIA', name: 'Miami', alt: 'Florida', lat: 25.796, lon: -80.287, zone: -4, region: 'Americas',
   legs: [['AY7', 'HEL', 'MIA'], ['AY8', 'MIA', 'HEL']], aircraft: 'Airbus A350-900'},
  {code: 'HKT', name: 'Phuket', alt: 'Thaimaa', lat: 8.113, lon: 98.317, zone: 7, region: 'Asia',
   legs: [['AY151', 'HEL', 'HKT'], ['AY152', 'HKT', 'HEL']], aircraft: 'Airbus A350-900'},
  {code: 'LPA', name: 'Las Palmas', alt: 'Gran Canaria', lat: 27.932, lon: -15.387, zone: 1, region: 'Canaries',
   legs: [['AY1721', 'HEL', 'LPA'], ['AY1722', 'LPA', 'HEL']], aircraft: 'Airbus A350-900'},
  {code: 'TFS', name: 'Teneriffa', alt: 'Tenerife Sur', lat: 28.044, lon: -16.572, zone: 1, region: 'Canaries',
   legs: [['AY1691', 'HEL', 'TFS'], ['AY1692', 'TFS', 'HEL']], aircraft: 'Airbus A321'},
  {code: 'INN', name: 'Innsbruck', alt: 'Tiroli', lat: 47.260, lon: 11.344, zone: 2, region: 'Alps',
   legs: [['AY1491', 'HEL', 'INN'], ['AY1492', 'INN', 'HEL']], aircraft: 'Airbus A320'},
  {code: 'TMP', name: 'Tampere', alt: 'Pirkkala', lat: 61.414, lon: 23.604, region: 'Finland', legs: []}
];

const airportOf = w => { const {code, name, alt, lat, lon, zone} = w; return {code, name, ...(alt ? {alt} : {}), lat, lon, ...(zone !== undefined ? {zone} : {})}; };

const airports = [...demo.airports];
const flights = [...demo.flights];
const added = [];
for (const w of WINTER) {
  if (!airports.some(a => a.code === w.code)) airports.push(airportOf(w));
  for (const [number, from, to] of w.legs) {
    const id = `${number}-${OPENS}-${from}-${to}`;
    const at = flights.findIndex(f => f.id === id);
    if (at >= 0) flights.splice(at, 1);
    // No departure or arrival: the schema accepts a route marked as opening with no timings.
    flights.push({id, number, from, to, aircraft: w.aircraft, airline: 'Finnair', status: 'Opens with the winter season', opens: OPENS, source: "flightmapper.net Finnair route page, previous season's numbers; winter 2026/27 not published"});
    added.push(`${number} ${from}-${to}`);
  }
  if (!w.legs.length) {
    const id = `${w.code}-${OPENS}-opens`;
    const at = flights.findIndex(f => f.id === id);
    if (at >= 0) flights.splice(at, 1);
    {
      flights.push({id, from: 'HEL', to: w.code, airline: 'Finnair', status: 'Opens with the winter season, timetable not filed', opens: OPENS, source: 'route announcement; no timetable filed'});
      added.push(`HEL-${w.code} (no number published)`);
    }
  }
}

airports.sort((a, b) => a.code.localeCompare(b.code));
flights.sort((a, b) => (a.departure || '9999').localeCompare(b.departure || '9999') || a.number?.localeCompare(b.number || '') || a.id.localeCompare(b.id));

const source = await readFile('public/demo.mjs', 'utf8');
const head = source.slice(0, source.indexOf('export const airports'));
const tail = source.slice(source.indexOf('export const codeshareAirports'));
await writeFile('public/demo.mjs', head
  .replace(/\d+ weekly services between \d+ airports/, `${flights.length} weekly services between ${airports.length} airports`)
  + `export const airports = ${JSON.stringify(airports, null, 2)};

export const flights = ${JSON.stringify(flights, null, 2)};

` + tail);

console.log(`winter season added: ${WINTER.map(w => w.code).join(' ')}`);
for (const a of added) console.log(`  ${a}  opens ${OPENS}, no timings published`);
console.log(`${flights.length} services over ${airports.length} airports`);
