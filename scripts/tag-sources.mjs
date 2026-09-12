#!/usr/bin/env node
// Records on every service where its schedule came from, so the sheet can be questioned:
//
//   node scripts/tag-sources.mjs
//
// Services written by scripts/rebuild-codeshares.mjs, scripts/correct-from-routes.mjs and
// scripts/add-winter-season.mjs already carry their own source and are left alone. This fills in
// the rest: the services the sheet was originally built from, and the ones the Finavia verification
// pass added or re-drew.
//
// The distinction matters. Finavia is the Finnish airport authority's own movement feed, so a
// service tagged to it was observed at a Finnish airport on a real day. The collected week is
// second-hand and older. Two Lapland legs are neither: Finavia sees the Alta end only as an
// estimated back-calculation, so their times are a reconstruction and say so.
import {readFile, writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';

const COLLECTED = 'published per-flight schedule pages, reconciled against Finavia';
const FINAVIA = 'Finavia public flight information';
const RECONSTRUCTED = 'Finavia public flight information, Alta leg reconstructed from the Helsinki arrival';

// Services the Finavia verification pass added or re-drew, by flight number and city pair.
const FROM_FINAVIA = new Set([
  'AY541|RVN|TOS', 'AY542|TOS|RVN',            // Rovaniemi–Tromsø tag
  'AY611|IVL|KKN', 'AY612|KKN|IVL',            // Ivalo–Kirkenes, first rotation
  'AY613|IVL|KKN', 'AY614|KKN|IVL',            // Ivalo–Kirkenes, second rotation
  'AY2081|HEL|CFU', 'AY2082|CFU|HEL',          // Corfu, seen in the live feed
  'AY2095|HEL|PVK', 'AY2096|PVK|HEL',          // Preveza, seen in the live feed
  'AY69|HEL|KIX'                               // the Osaka rotation whose outbound was missing
]);
const RECONSTRUCTED_LEGS = new Set(['AY591|KTT|ALF', 'AY592|ALF|KTT']);

const key = f => [f.number, f.from, f.to].join('|');
let filled = 0, kept = 0;
const tag = f => {
  if (f.source) { kept++; return f; }
  filled++;
  if (RECONSTRUCTED_LEGS.has(key(f))) return {...f, source: RECONSTRUCTED};
  if (FROM_FINAVIA.has(key(f))) return {...f, source: FINAVIA};
  return {...f, source: COLLECTED};
};

const flights = demo.flights.map(tag);
const codeshareFlights = demo.codeshareFlights.map(tag);

const source = await readFile('public/demo.mjs', 'utf8');
const head = source.slice(0, source.indexOf('export const airports'));
const airportsBlock = source.slice(source.indexOf('export const airports'), source.indexOf('export const flights'));
const codeshareAirportsBlock = source.slice(source.indexOf('export const codeshareAirports'), source.indexOf('export const codeshareFlights'));
const footer = source.slice(source.indexOf('export default {'));

await writeFile('public/demo.mjs', head + airportsBlock
  + `export const flights = ${JSON.stringify(flights, null, 2)};

` + codeshareAirportsBlock
  + `export const codeshareFlights = ${JSON.stringify(codeshareFlights, null, 2)};

` + footer);

const counts = {};
for (const f of [...flights, ...codeshareFlights]) counts[f.source] = (counts[f.source] || 0) + 1;
console.log(`tagged ${filled} service(s); ${kept} already carried a source`);
for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${name}`);
