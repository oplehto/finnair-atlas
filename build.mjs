import {build} from 'esbuild';
import {mkdir, copyFile, readFile, writeFile, rm, cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// 1. Fonts and the browser bundle for the Node server.
await mkdir('public/dist/fonts', {recursive: true});
for (const [family, weight] of [['oswald', 600], ['roboto-condensed', 400], ['roboto-condensed', 700]]) {
  const file = `${family}-latin-${weight}-normal.woff2`;
  await copyFile(`node_modules/@fontsource/${family}/files/${file}`, `public/dist/fonts/${file}`);
  await copyFile(`node_modules/@fontsource/${family}/LICENSE`, `public/dist/fonts/${family}-LICENSE.txt`);
}
await build({entryPoints: ['public/app.mjs'], bundle: true, format: 'esm', outfile: 'public/dist/app.js'});

// 2. A static site in site/ for GitHub Pages or any file host: the same files plus the baked schedule.
const {default: demo} = await import('./public/demo.mjs');
await rm('site', {recursive: true, force: true});
await mkdir('site', {recursive: true});
// Every asset the page names carries a hash of its own contents in its filename, so a publish
// changes what the page asks for and a returning visitor can never be served yesterday's code
// against today's page. A stable name leaves that to cache expiry, which bit this project three
// times: twice on the schedule, once on the bundle, each time looking like a failed deploy while
// the files on the server were perfectly correct.
const hash = body => createHash('sha256').update(body).digest('hex').slice(0, 12);
let page = await readFile('public/index.html', 'utf8');
for (const [from, name, ext] of [['public/style.css', 'style', 'css'], ['public/fonts.css', 'fonts', 'css'], ['public/dist/app.js', 'app', 'mjs']]) {
  const body = await readFile(from);
  const named = `${name}.${hash(body)}.${ext}`;
  await writeFile(`site/${named}`, body);
  const referenced = `${name}.${ext === 'mjs' ? 'mjs' : 'css'}`;
  if (!page.includes(referenced)) throw Error(`the page never references ${referenced}`);
  page = page.replaceAll(referenced, named);
}
// The static build reads its schedule from a baked file, so it never probes the Node server's API.
const schedule = JSON.stringify(demo);
const scheduleFile = `data/schedule.${hash(schedule)}.json`;
page = page.replace('</head>', `<meta name="schedule-source" content="${scheduleFile}"></head>`);
await writeFile('site/index.html', page);
await cp('public/dist/fonts', 'site/fonts', {recursive: true});
await mkdir('site/data', {recursive: true});
await writeFile(`site/${scheduleFile}`, schedule);
await writeFile('site/.nojekyll', '');
await writeFile('site/robots.txt', 'User-agent: *\nAllow: /\n');
// No _headers file: GitHub Pages does not read one, so promising cache or security headers here
// would be decoration. The schedule is safe to cache regardless, because its filename carries a
// hash of its contents — a new sheet is a new name, not a stale one.
