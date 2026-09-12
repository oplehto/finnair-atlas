#!/usr/bin/env node
// Checks every partner codeshare on the sheet against published Finnair route pages:
//
//   node scripts/verify-codeshares.mjs                    # report only
//   node scripts/verify-codeshares.mjs --json out.json    # also write the parsed truth
//
// Finnair's own timetable API is behind Akamai and answers 403 to any automated client, so the
// reference here is info.flightmapper.net, which publishes one page per Finnair route listing the
// AY marketing number, the operating carrier and its flight number, the equipment and the times.
// Pages are cached under .cache/flightmapper so a re-run costs nothing.
import {writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';
import {fetchRoute, flatten, parseRows} from './flightmapper.mjs';

const WEEK = '2026-09-14';
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const legs = demo.codeshareFlights.map(f => ({
  from: f.from, to: f.to,
  ay: f.number.replace(/\s+/g, ''),
  operator: f.operator || null,
  operatorFlight: (f.operatorFlight || '').replace(/\s+/g, '') || null,
  aircraft: f.aircraft || null,
  dep: f.departure.slice(11, 16), arr: f.arrival.slice(11, 16)
}));

const report = [];
for (const leg of legs) {
  const text = flatten(await fetchRoute(leg.from, leg.to));
  if (!text.trim()) { report.push({...leg, verdict: 'NO FINNAIR CODESHARE'}); continue; }
  const {chosen, coveredWeek, rows} = parseRows(text, leg.from, leg.to, WEEK);
  if (!rows.length) {
    const anyFinnair = /Finnair AY \d+/.test(text);
    report.push({...leg, verdict: anyFinnair ? 'NO SUCH DIRECTION' : 'NO FINNAIR CODESHARE'});
    continue;
  }
  const match = chosen.find(r => r.ay === leg.ay) || null;
  const operators = [...new Set(chosen.map(r => r.operator).filter(Boolean))];
  const numbers = [...new Set(chosen.map(r => r.ay))];
  const opFlights = [...new Set(chosen.map(r => r.operatorFlight?.replace(/\s+/g, '')).filter(Boolean))];
  const problems = [];
  if (!match) problems.push(`AY number ${leg.ay} not published (published: ${numbers.join(', ')})`);
  if (leg.operatorFlight && opFlights.length && !opFlights.includes(leg.operatorFlight)) problems.push(`operating flight ${leg.operatorFlight} not published (published: ${opFlights.join(', ')})`);
  const times = chosen.map(r => `${r.dep}-${r.arr}`);
  if (!times.includes(`${leg.dep}-${leg.arr}`)) problems.push(`times ${leg.dep}-${leg.arr} not published (published: ${[...new Set(times)].join(', ')})`);
  report.push({...leg, verdict: problems.length ? 'MISMATCH' : 'OK', problems, coveredWeek, published: chosen});
}

const by = v => report.filter(r => r.verdict === v);
console.log(`${report.length} partner legs checked against published Finnair route pages for the week of ${WEEK}\n`);
for (const verdict of ['NO FINNAIR CODESHARE', 'NO SUCH DIRECTION', 'FETCH FAILED', 'MISMATCH', 'OK']) {
  const set = by(verdict);
  if (!set.length) continue;
  console.log(`${verdict}: ${set.length}`);
  if (verdict === 'OK') continue;
  for (const r of set) {
    console.log(`  ${r.from}-${r.to} ${r.ay} (sheet: ${r.operator || '?'} ${r.operatorFlight || '?'} ${r.dep}-${r.arr})`);
    for (const p of r.problems || []) console.log(`      ${p}`);
  }
  console.log('');
}
if (jsonOut) { await writeFile(jsonOut, JSON.stringify(report, null, 1)); console.log(`parsed reference written to ${jsonOut}`); }
