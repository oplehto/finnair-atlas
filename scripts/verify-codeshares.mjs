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
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import demo from '../public/demo.mjs';

const WEEK = '2026-09-14';
const CACHE = '.cache/flightmapper';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

await mkdir(CACHE, {recursive: true});

async function page(from, to) {
  const file = `${CACHE}/AY_${from}_${to}.html`;
  try { return await readFile(file, 'utf8'); } catch { /* not cached yet */ }
  // A slow or refused page must not abandon the whole audit: try twice, then record the gap.
  for (const attempt of [1, 2]) {
    try {
      const response = await fetch(`https://info.flightmapper.net/route/Finnair_AY_${from}_${to}`, {headers: {'user-agent': UA}, signal: AbortSignal.timeout(45000)});
      if (!response.ok) break;
      const body = await response.text();
      await writeFile(file, body);
      return body;
    } catch { if (attempt === 2) return ''; }
  }
  return '';
}

// The pages are ordinary HTML; flattening the tags leaves one readable run of text per schedule row.
const flatten = html => html
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
  .replace(/\s+/g, ' ');

// The token after each airport code is its terminal, which may be a number or a letter (LHR 5,
// GLA M, CTS D), so it is matched loosely rather than as a digit.
const ROW = /(?<days>(?:Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[A-Za-z,-]*) (?<dep>\d{2}:\d{2}) [^()]*\((?<origin>[A-Z]{3})\) [A-Z0-9]+ (?<arr>\d{2}:\d{2}) [^()]*\((?<dest>[A-Z]{3})\) [A-Z0-9]+ Finnair AY (?<ay>\d+) (?<body>.{0,260}?)(?= (?:Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[A-Za-z,-]* \d{2}:\d{2} |$)/g;

// Each row carries either "Valid until <date>", "Effective <date> through <date>" or neither; keep
// the rows whose window covers the sheet's week, and fall back to every row when none does.
function rowsFor(text, from, to) {
  const rows = [];
  for (const m of text.matchAll(ROW)) {
    const {days, dep, arr, origin, dest, ay, body} = m.groups;
    if (origin !== from || dest !== to) continue;
    const operated = /Codeshare flight, operated by ([^.]+)\.\(\s*([A-Z0-9]{2})\s*(\d+)\s*\)/.exec(body);
    const aircraft = /((?:Airbus|Boeing|Embraer|ATR|Bombardier|De Havilland|McDonnell)[A-Za-z0-9 .-]*?)\s*\([A-Z0-9]{3,4}\)/.exec(body);
    const until = /Valid until (\d{4}-\d{2}-\d{2})/.exec(body);
    const window = /Effective (\d{4}-\d{2}-\d{2}) through (\d{4}-\d{2}-\d{2})/.exec(body);
    const from_ = /Effective (\d{4}-\d{2}-\d{2})(?! through)/.exec(body);
    let covers = true;
    if (window) covers = window[1] <= WEEK && WEEK <= window[2];
    else if (until) covers = WEEK <= until[1];
    else if (from_) covers = from_[1] <= WEEK;
    rows.push({
      days, dep, arr, ay: `AY${ay}`,
      operator: operated ? operated[1].trim() : null,
      operatorFlight: operated ? `${operated[2]}${operated[3]}` : null,
      aircraft: aircraft ? aircraft[1].trim() : null,
      validity: window ? `${window[1]}..${window[2]}` : until ? `..${until[1]}` : from_ ? `${from_[1]}..` : 'unstated',
      covers
    });
  }
  const inWeek = rows.filter(r => r.covers);
  return {rows, chosen: inWeek.length ? inWeek : rows, coveredWeek: inWeek.length > 0};
}

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
  const text = flatten(await page(leg.from, leg.to));
  if (!text.trim()) { report.push({...leg, verdict: 'FETCH FAILED'}); continue; }
  const {chosen, coveredWeek, rows} = rowsFor(text, leg.from, leg.to);
  if (!rows.length) {
    const anyFinnair = /Finnair AY \d+/.test(text);
    report.push({...leg, verdict: anyFinnair ? 'NO SUCH DIRECTION' : 'NO FINNAIR CODESHARE'});
    continue;
  }
  const match = chosen.find(r => r.ay === leg.ay) || null;
  const operators = [...new Set(chosen.map(r => r.operator).filter(Boolean))];
  const numbers = [...new Set(chosen.map(r => r.ay))];
  const opFlights = [...new Set(chosen.map(r => r.operatorFlight).filter(Boolean))];
  const problems = [];
  if (!match) problems.push(`AY number ${leg.ay} not published (published: ${numbers.join(', ')})`);
  if (leg.operator && operators.length && !operators.some(o => o.toLowerCase().startsWith(leg.operator.toLowerCase().split(' ')[0]))) problems.push(`operator ${leg.operator} not published (published: ${operators.join(', ')})`);
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
