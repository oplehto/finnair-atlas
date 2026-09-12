import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, access} from 'node:fs/promises';

// Every asset the published page names must carry a hash of its own contents, so that a publish
// changes what the page asks for. A stable name leaves freshness to cache expiry, and a returning
// visitor is then served yesterday's code against today's page — which happened three times here,
// twice on the schedule and once on the bundle, each looking like a failed deploy while the files
// on the server were correct. The fonts are exempt: they sit in their own directory and change only
// with the @fontsource version.
test('the published page names only content-hashed assets', async () => {
  execFileSync('node', ['build.mjs'], {stdio: 'pipe'});
  const page = await readFile('site/index.html', 'utf8');

  const referenced = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
    .concat([...page.matchAll(/<meta name="schedule-source" content="([^"]+)"/g)].map(m => m[1]))
    .filter(ref => !/^(https?:|data:|#|\/\/)/.test(ref));

  assert.ok(referenced.length >= 4, `the page references ${referenced.length} local assets`);

  const hashed = /\.[0-9a-f]{12}\.(?:css|mjs|json)$/;
  for (const ref of referenced) {
    if (ref.startsWith('fonts/')) continue; // versioned by the font package, in their own directory
    assert.match(ref, hashed, `${ref} is named without a content hash, so a publish cannot invalidate it`);
    await assert.doesNotReject(access(`site/${ref}`), `${ref} is referenced but not written`);
  }

  // The hash has to follow the contents, or it is decoration.
  const {createHash} = await import('node:crypto');
  for (const ref of referenced.filter(r => hashed.test(r))) {
    const body = await readFile(`site/${ref}`);
    const expected = createHash('sha256').update(body).digest('hex').slice(0, 12);
    assert.equal(ref.match(/\.([0-9a-f]{12})\./)[1], expected, `${ref} does not match the hash of its own contents`);
  }
});
