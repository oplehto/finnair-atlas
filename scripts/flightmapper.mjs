// Reads published Finnair route pages from info.flightmapper.net, which carry the AY marketing
// number, the operating carrier and its flight, the equipment, the days and the times for each
// schedule period. Finnair's own timetable API is behind Akamai and answers 403 to any automated
// client, so this is the reference the correction and audit scripts share.
//
// Pages are cached under .cache/flightmapper; a route Finnair does not serve redirects to the
// carrier-agnostic YY page and 404s, which is an answer rather than a failure and is cached as ''.
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const CACHE = '.cache/flightmapper';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const DAY_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function fetchPage(path, name) {
  await mkdir(CACHE, {recursive: true});
  const file = `${CACHE}/${name}.html`;
  try { return await readFile(file, 'utf8'); } catch { /* not cached yet */ }
  for (const attempt of [1, 2]) {
    try {
      const response = await fetch(`https://info.flightmapper.net${path}`, {headers: {'user-agent': UA}, signal: AbortSignal.timeout(45000)});
      if (response.status === 404 || /\/route\/YY_/.test(response.url)) { await writeFile(file, ''); return ''; }
      if (!response.ok) break;
      const body = await response.text();
      await writeFile(file, body);
      return body;
    } catch { if (attempt === 2) return ''; }
  }
  return '';
}

export const fetchRoute = (from, to) => fetchPage(`/route/Finnair_AY_${from}_${to}`, `AY_${from}_${to}`);

// Flattening the tags leaves one readable run of text per schedule row.
export const flatten = html => html
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
  .replace(/\s+/g, ' ');

// An airport code may be followed by its terminal, which is sometimes a number and sometimes a
// letter (LHR 5, GLA M, CTS D, DOH 1A) and often absent altogether, so the token is optional.
const ROW = /(?<days>(?:Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[A-Za-z,-]*) (?<dep>\d{2}:\d{2}) [^()]*\((?<origin>[A-Z]{3})\)(?: [A-Z0-9]{1,3})? (?<arr>\d{2}:\d{2}) [^()]*\((?<dest>[A-Z]{3})\)(?: [A-Z0-9]{1,3})? Finnair AY (?<ay>\d+) (?<body>.{0,700}?)(?= (?:Daily|Mon|Tue|Wed|Thu|Fri|Sat|Sun)[A-Za-z,-]* \d{2}:\d{2} |$)/g;

// "Daily" or a mix of single days and ranges: Mon,Wed,Sat / Tue-Fri / Mon,Wed-Sun.
export function dayMarks(days) {
  if (/^Daily/.test(days)) return '#';
  const set = new Set();
  for (const part of days.split(',')) {
    const range = /^([A-Z][a-z]{2})-([A-Z][a-z]{2})$/.exec(part);
    if (range) {
      const a = DAY_NAMES.indexOf(range[1]), b = DAY_NAMES.indexOf(range[2]);
      if (a < 0 || b < 0) continue;
      for (let i = a; i !== (b + 1) % 7; i = (i + 1) % 7) set.add(i);
    } else {
      const i = DAY_NAMES.indexOf(part.trim());
      if (i >= 0) set.add(i);
    }
  }
  if (!set.size) return '#';
  if (set.size === 7) return '#';
  return [...set].sort((a, b) => a - b).map(i => DAY_MARKS[i]).join('');
}

// Every schedule row on the page for this city pair, with the ones whose validity window covers
// `week` marked. A row states either "Valid until <date>", "Effective <date> through <date>",
// "Effective <date>", "Operates only on <date>", or nothing at all.
export function parseRows(text, from, to, week) {
  const rows = [];
  for (const m of text.matchAll(ROW)) {
    const {days, dep, arr, origin, dest, ay, body} = m.groups;
    if (origin !== from || dest !== to) continue;
    const operated = /Codeshare flight, operated by ([^.]+)\.\(\s*([A-Z0-9]{2})\s*(\d+)\s*\)/.exec(body);
    const aircraft = /((?:Airbus|Boeing|Embraer|ATR|Bombardier|De Havilland|McDonnell)[A-Za-z0-9 .-]*?)\s*\([A-Z0-9]{3,4}\)/.exec(body);
    const until = /Valid until (\d{4}-\d{2}-\d{2})/.exec(body);
    const window = /Effective (\d{4}-\d{2}-\d{2}) through (\d{4}-\d{2}-\d{2})/.exec(body);
    const onward = /Effective (\d{4}-\d{2}-\d{2})(?! through)/.exec(body);
    const single = /Operates only on (\d{4}-\d{2}-\d{2})/.exec(body);
    let covers = true, validity = 'unstated';
    if (window) { covers = window[1] <= week && week <= window[2]; validity = `${window[1]}..${window[2]}`; }
    else if (single) { covers = single[1] === week; validity = single[1]; }
    else if (until) { covers = week <= until[1]; validity = `..${until[1]}`; }
    else if (onward) { covers = onward[1] <= week; validity = `${onward[1]}..`; }
    rows.push({
      days, marks: dayMarks(days), dep, arr, ay: `AY${ay}`,
      operator: operated ? operated[1].trim() : null,
      operatorFlight: operated ? `${operated[2]} ${operated[3]}` : null,
      aircraft: aircraft ? aircraft[1].trim() : null,
      nextDay: /arrives 1 day after departure/.test(body) || arr < dep,
      validity, covers
    });
  }
  const inWeek = rows.filter(r => r.covers);
  return {rows, chosen: inWeek.length ? inWeek : rows, coveredWeek: inWeek.length > 0};
}

// The row to draw: prefer one valid in the sheet's week that names its operating carrier, then the
// one running on the most days, so a city pair with several rotations contributes its principal
// service and always carries the operating flight number the sheet prints.
export function principalRow(text, from, to, week) {
  const {rows, chosen} = parseRows(text, from, to, week);
  if (!chosen.length) return null;
  const weight = r => (r.operatorFlight ? 100 : 0) + (r.marks === '#' ? 7 : r.marks.length);
  const row = [...chosen].sort((a, b) => weight(b) - weight(a) || a.dep.localeCompare(b.dep))[0];
  // Some schedule periods omit the operating carrier even though neighbouring periods of the same
  // flight, at the same times, name it. Borrowing from those is reading the same page more
  // carefully, not filling a gap with a guess; a flight with no such sibling stays unattributed.
  if (!row.operatorFlight) {
    const sibling = rows.find(r => r !== row && r.ay === row.ay && r.dep === row.dep && r.arr === row.arr && r.operatorFlight);
    if (sibling) return {...row, operator: sibling.operator, operatorFlight: sibling.operatorFlight, aircraft: row.aircraft || sibling.aircraft};
  }
  return row;
}
