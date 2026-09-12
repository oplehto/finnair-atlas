#!/usr/bin/env node
// Walks the published Finnair flight index and writes the whole AY network — own metal and
// codeshares alike — as JSON, so the sheet's partner grids can be built from real destinations
// instead of guessed ones:
//
//   node scripts/discover-network.mjs --out network.json
//   node scripts/discover-network.mjs --out network.json --from SIN,LHR,HKG   # only these origins
//
// The index lists every airport Finnair departs from, and one page per origin lists its
// destinations with each AY flight number and whether it is a codeshare. Pages are cached under
// .cache/flightmapper, so a re-run costs nothing.
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const CACHE = '.cache/flightmapper';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const args = process.argv.slice(2);
const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const out = arg('--out') || 'network.json';
const only = arg('--from')?.split(',').map(s => s.trim().toUpperCase());

await mkdir(CACHE, {recursive: true});

async function fetchCached(path, name) {
  const file = `${CACHE}/${name}.html`;
  try { return await readFile(file, 'utf8'); } catch { /* not cached yet */ }
  for (const attempt of [1, 2]) {
    try {
      const response = await fetch(`https://info.flightmapper.net${path}`, {headers: {'user-agent': UA}, signal: AbortSignal.timeout(45000)});
      if (response.status === 404) { await writeFile(file, ''); return ''; }
      if (!response.ok) break;
      const body = await response.text();
      await writeFile(file, body);
      return body;
    } catch { if (attempt === 2) return ''; }
  }
  return '';
}

const flatten = html => html
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

// The index is a list of country headings and airport links: <h3>Country</h3> <a href="/airline/AY/XXX">City</a> (XXX)
const index = await fetchCached('/airline/AY', 'index_AY');
if (!index.trim()) throw Error('could not read the Finnair flight index');
const origins = [];
for (const m of index.matchAll(/<h3>([^<]+)<\/h3>\s*<a href="\/airline\/AY\/([A-Z]{3})">\s*([^<]+?)\s*<\/a>/g)) {
  origins.push({country: m[1].trim(), code: m[2], city: m[3].trim()});
}
console.log(`Finnair flight index: ${origins.length} departure airports`);

const wanted = only ? origins.filter(o => only.includes(o.code)) : origins;
const network = {origins: {}, generated: new Date().toISOString().slice(0, 16) + 'Z'};
let routes = 0, failed = [];
for (const origin of wanted) {
  const html = await fetchCached(`/airline/AY/${origin.code}`, `from_${origin.code}`);
  if (!html.trim()) { failed.push(origin.code); continue; }
  const dests = [...new Set([...html.matchAll(new RegExp(`href="/route/Finnair_AY_${origin.code}_([A-Z]{3})"`, 'g'))].map(m => m[1]))];
  // The flattened page reads "Country City (XXX) Direct Available flights: AY 5013 Codeshare ...",
  // so each destination's own flight numbers follow its code up to the next destination's country.
  const text = flatten(html);
  const entries = [];
  for (const code of dests) {
    const at = text.indexOf(`(${code}) `);
    if (at < 0) { entries.push({code, flights: []}); continue; }
    const after = text.slice(at, at + 400);
    const stop = after.search(/\([A-Z]{3}\) (?:Direct|One stop|Available)/g.source ? /\([A-Z]{3}\) Direct/ : /$/);
    const segment = stop > 3 ? after.slice(0, stop) : after;
    const flights = [...segment.matchAll(/AY (\d+)(\s*Codeshare)?/g)].map(m => ({number: `AY${m[1]}`, codeshare: !!m[2]}));
    const stops = /\bOne stop\b/.test(segment) && !/\bDirect\b/.test(segment) ? 'one-stop' : 'direct';
    entries.push({code, stops, flights});
  }
  network.origins[origin.code] = {city: origin.city, country: origin.country, destinations: entries};
  routes += entries.length;
  if (wanted.length > 20 && Object.keys(network.origins).length % 25 === 0) console.log(`  ${Object.keys(network.origins).length}/${wanted.length} origins, ${routes} routes so far`);
}

await writeFile(out, JSON.stringify(network, null, 1));
console.log(`${Object.keys(network.origins).length} origins, ${routes} routes written to ${out}`);
if (failed.length) console.log(`no page for: ${failed.join(' ')}`);
