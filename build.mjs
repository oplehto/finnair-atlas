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
for (const [from, to] of [['public/style.css', 'style.css'], ['public/fonts.css', 'fonts.css'], ['public/dist/app.js', 'app.mjs']]) await copyFile(from, `site/${to}`);
// The static build reads its schedule from a baked file, so it never probes the Node server's API.
// The file carries a hash of its own contents in its name: a deploy then changes the name the page
// asks for, and every visitor sees the new sheet at once. Serving it under a stable name with a
// finite max-age instead means a returning visitor keeps the old schedule until that expires, which
// happened here — twice — and looked exactly like a failed deploy.
const schedule = JSON.stringify(demo);
const digest = createHash('sha256').update(schedule).digest('hex').slice(0, 12);
const scheduleFile = `data/schedule.${digest}.json`;
const page = await readFile('public/index.html', 'utf8');
await writeFile('site/index.html', page.replace('</head>', `<meta name="schedule-source" content="${scheduleFile}"></head>`));
await cp('public/dist/fonts', 'site/fonts', {recursive: true});
await mkdir('site/data', {recursive: true});
await writeFile(`site/${scheduleFile}`, schedule);
await writeFile('site/.nojekyll', '');
await writeFile('site/robots.txt', 'User-agent: *\nAllow: /\n');
// No _headers file: GitHub Pages does not read one, so promising cache or security headers here
// would be decoration. The schedule is safe to cache regardless, because its filename carries a
// hash of its contents — a new sheet is a new name, not a stale one.
