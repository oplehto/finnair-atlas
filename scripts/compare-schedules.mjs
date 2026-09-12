#!/usr/bin/env node
// Compares two weekly schedule JSON files (arrays of {number, from, to, departure, arrival, days}) and prints
// agreements and discrepancies per route: node scripts/compare-schedules.mjs main.json reference.json
import {readFile} from 'node:fs/promises';
const load = async p => { const j = JSON.parse(await readFile(p, 'utf8')); return Array.isArray(j) ? j : j.services || j.flights || []; };
const [main, ref] = await Promise.all([load(process.argv[2]), load(process.argv[3])]);
const norm = n => String(n).replace(/^([A-Z0-9]{2})\s*0*(\d+)/i, (m, c, d) => `${c.toUpperCase()}${d}`);
const minutes = t => t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null;
const key = s => `${norm(s.number)}|${s.from}|${s.to}`;
const byKey = new Map(main.map(s => [key(s), s]));
const routes = new Set(ref.map(s => `${s.from}-${s.to}`));
let same = 0, timeDiff = 0, dayDiff = 0, missing = 0;
const notes = [];
for (const r of ref) {
  const m = byKey.get(key(r));
  if (!m) { missing++; notes.push(`missing in main: ${norm(r.number)} ${r.from}-${r.to} ${r.departure} ${r.days}`); continue; }
  const dd = Math.abs(minutes(m.departure) - minutes(r.departure)), da = Math.abs(minutes(m.arrival) - minutes(r.arrival));
  const days = (m.days || '#') === (r.days || '#');
  if ((dd > 10 || da > 10)) { timeDiff++; notes.push(`time: ${norm(r.number)} ${r.from}-${r.to} main ${m.departure}→${m.arrival} ref ${r.departure}→${r.arrival}`); }
  else if (!days) { dayDiff++; notes.push(`days: ${norm(r.number)} ${r.from}-${r.to} main ${m.days} ref ${r.days}`); }
  else same++;
}
const extra = main.filter(s => routes.has(`${s.from}-${s.to}`) && !ref.some(r => key(r) === key(s)));
console.log(`reference services ${ref.length} on ${routes.size} routes: ${same} agree, ${timeDiff} differ in time, ${dayDiff} differ in days, ${missing} missing from main; ${extra.length} extra in main on those routes`);
for (const n of notes) console.log(' ', n);
for (const s of extra) console.log('  extra in main:', norm(s.number), s.from + '-' + s.to, s.departure, s.days);
