import {build} from 'esbuild';
import {mkdir, copyFile, writeFile, rm, cp} from 'node:fs/promises';

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
for (const [from, to] of [['public/index.html', 'index.html'], ['public/style.css', 'style.css'], ['public/fonts.css', 'fonts.css'], ['public/dist/app.js', 'app.mjs']]) await copyFile(from, `site/${to}`);
await cp('public/dist/fonts', 'site/fonts', {recursive: true});
await writeFile('site/schedule.json', JSON.stringify(demo));
await writeFile('site/.nojekyll', '');
await writeFile('site/robots.txt', 'User-agent: *\nAllow: /\n');
