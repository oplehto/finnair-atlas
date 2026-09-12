#!/usr/bin/env node
// Reconciles collected weekly schedules into one file:
//   node scripts/merge-weekly.mjs main.json reference.json finavia-snapshot.json out.json
// - reference rows win on the routes they cover (they were parsed per flight page with effective-date handling);
// - main rows fill the remaining routes;
// - the Finavia snapshot (real scheduled times for one weekday at Finnish airports) corrects any service
//   operating that weekday whose Finnish-end time is off by more than 10 minutes, preserving block time,
//   and adds services it lists that neither file has, marked for that weekday only.
import {readFile, writeFile} from 'node:fs/promises';
const load = async p => { const j = JSON.parse(await readFile(p, 'utf8')); return Array.isArray(j) ? {rows: j, extra: []} : {rows: j.services || j.flights || [], extra: j.newAirports || []}; };
const [main, ref] = await Promise.all([load(process.argv[2]), load(process.argv[3])]);
const snapshot = JSON.parse(await readFile(process.argv[4], 'utf8'));
const out = process.argv[5];
const DAY_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
const norm = n => String(n).replace(/^([A-Z0-9]{2})\s*0*(\d+)/i, (m, c, d) => `${c.toUpperCase()}${d}`);
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 1440) + 1440) % 1440 % 60).padStart(2, '0')}`;

const refRoutes = new Set(ref.rows.map(s => `${s.from}-${s.to}`));
const rows = [...ref.rows, ...main.rows.filter(s => !refRoutes.has(`${s.from}-${s.to}`))].map(s => ({...s, number: norm(s.number), days: s.days && s.days !== 'daily' ? s.days : '#'}));

// Finavia's sampled weekday and its scheduled times at the Finnish end.
const sampledDate = (snapshot.source.match(/fetched (\d{4}-\d{2}-\d{2})/) || [])[1];
const sampledMark = DAY_MARKS[(new Date(sampledDate + 'T12:00:00Z').getUTCDay() + 6) % 7];
const finnish = new Set(snapshot.airports.filter(a => ['HEL','OUL','RVN','KTT','IVL','KAO','KAJ','KEM','KUO','JOE','JYV','VAA','KOK','TKU','TMP','MHQ','POR','SVL'].includes(a.code)).map(a => a.code));
const finavia = new Map();
for (const f of snapshot.flights) {
  if (!f.departure.startsWith(sampledDate) && !f.arrival.startsWith(sampledDate)) continue;
  const end = finnish.has(f.from) && !/Departure estimated/.test(f.status) ? 'departure' : 'arrival';
  finavia.set(`${norm(f.number)}|${f.from}|${f.to}`, {end, time: (end === 'departure' ? f.departure : f.arrival).slice(11, 16), aircraft: f.aircraft, flight: f});
}

let corrected = 0, added = 0;
const operates = s => s.days === '#' || s.days.includes(sampledMark);
const byKey = new Map();
for (const s of rows) { const k = `${s.number}|${s.from}|${s.to}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(s); }
for (const [k, list] of byKey) {
  const f = finavia.get(k);
  if (!f) continue;
  const candidates = list.filter(operates);
  if (!candidates.length) continue;
  const near = candidates.find(s => Math.abs(mins(s[f.end]) - mins(f.time)) <= 10);
  if (near) continue;
  // The sampled-day service is wrong in the collected files: move the timing, keep the block time.
  const s = candidates[0], delta = mins(f.time) - mins(s[f.end]);
  s.departure = hhmm(mins(s.departure) + delta); s.arrival = hhmm(mins(s.arrival) + delta);
  s.corrected = `Finavia ${sampledDate}`; corrected++;
}
for (const [k, f] of finavia) {
  if (byKey.has(k)) continue;
  const fl = f.flight;
  rows.push({number: norm(fl.number), from: fl.from, to: fl.to, departure: fl.departure.slice(11, 16), arrival: fl.arrival.slice(11, 16), nextDay: fl.arrival.slice(0, 10) > fl.departure.slice(0, 10), days: sampledMark, aircraft: fl.aircraft || null, source: 'Finavia public flights ' + sampledDate}); added++;
}
const services = rows.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.departure.localeCompare(b.departure));
await writeFile(out, JSON.stringify({services, newAirports: [...ref.extra, ...main.extra]}, null, 1));
console.log(`merged ${services.length} services on ${new Set(services.map(s => s.from + '-' + s.to)).size} route-directions: ${ref.rows.length} from the reference, ${services.length - ref.rows.length - added} from the main file, ${corrected} timings corrected from Finavia (${sampledMark}), ${added} added from Finavia for that day only`);
