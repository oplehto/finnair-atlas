import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, access, rm} from 'node:fs/promises';
import {stylesheetHref, fontUrls} from '../public/assets.mjs';

// The SVG export inlines the page's stylesheets and fonts so the exported file stands alone. It is a
// click handler, so its own machinery needs a browser — but the part that has actually broken is the
// naming, and that is plain functions over plain strings.
//
// It broke when the build began writing content-hashed filenames while the export still fetched
// `style.css` and `fonts.css` by name: exporting 404'd in production and no test noticed.

test('the export resolves stylesheets by the names the page really uses', () => {
  const hashed = ['fonts.228318fe409e.css', 'style.f42599a5f25b.css'];
  assert.equal(stylesheetHref(hashed, 'style'), 'style.f42599a5f25b.css');
  assert.equal(stylesheetHref(hashed, 'fonts'), 'fonts.228318fe409e.css');

  // The Node dev server serves unhashed files, and a page may carry neither link.
  assert.equal(stylesheetHref(['style.css', 'fonts.css'], 'style'), 'style.css');
  assert.equal(stylesheetHref([], 'style'), 'style.css');
  assert.equal(stylesheetHref([null, undefined], 'fonts'), 'fonts.css');

  // "fonts" must not match "style", and a prefix must not match a longer word: a sheet called
  // "styleguide.css" is not the timetable's stylesheet.
  assert.equal(stylesheetHref(['styleguide.css'], 'style'), 'style.css');
  assert.equal(stylesheetHref(['a/b/style.abc123def456.css'], 'style'), 'a/b/style.abc123def456.css');
});

test('the export can find and inline everything the built page names', async () => {
  // Build into a directory of this test's own: node --test runs files in parallel, and the build
  // clears its output directory first, so a shared one means each run can delete the other's.
  const OUT = `site-test-export`;
  after(() => rm(OUT, {recursive: true, force: true}));
  execFileSync('node', ['build.mjs'], {stdio: 'pipe', env: {...process.env, SITE_DIR: OUT}});
  const page = await readFile(`${OUT}/index.html`, 'utf8');
  const hrefs = [...page.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map(tag => /href="([^"]+)"/.exec(tag[0])?.[1]);
  assert.ok(hrefs.length >= 2, `the page links ${hrefs.length} stylesheets`);

  for (const name of ['style', 'fonts']) {
    const href = stylesheetHref(hrefs, name);
    assert.notEqual(href, `${name}.css`, `the export would fall back to ${name}.css, which the build does not write`);
    await assert.doesNotReject(access(`${OUT}/${href}`), `${href} is named by the page but not written`);
  }

  // Each @font-face must be reachable, or the exported sheet loses that face's type.
  const fontCss = await readFile(`${OUT}/${stylesheetHref(hrefs, 'fonts')}`, 'utf8');
  const faces = fontUrls(fontCss);
  const declared = (fontCss.match(/@font-face/g) || []).length;
  assert.ok(declared >= 3, `the page declares ${declared} font faces`);
  assert.equal(faces.length, declared, 'every declared face has a url the export can inline');
  for (const face of faces) await assert.doesNotReject(access(`${OUT}/${face.url}`), `${face.url} is declared but not written`);

  // The style guide requires the export to keep the route styles and the paper background, so the
  // stylesheet it inlines has to be the one that carries them.
  const css = await readFile(`${OUT}/${stylesheetHref(hrefs, 'style')}`, 'utf8');
  for (const rule of ['.flight.jet .ink', '.flight.prop .ink', '.flight.codeshare .ink', '.airport rect', '.edge-times', '.flight-label']) {
    assert.ok(css.includes(rule), `the inlined stylesheet is missing ${rule}, which the export needs`);
  }
});
