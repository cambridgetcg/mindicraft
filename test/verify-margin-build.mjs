import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { MARGIN_TERMS } from '../guide/xenia-worker.js';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

assert.equal(
  read(join(DIST, '_worker.js')),
  read(join(GUIDE, 'xenia-worker.js')),
  'the deployed worker must be the reviewed source bytes'
);

const index = json(join(DIST, 'api', 'index.json'));
assert.deepEqual(index.margin_terms, MARGIN_TERMS);
assert.match(index.endpoints.margin, /choices:\{publish:true, retain:true/);
assert.match(index.endpoints.margin, /DELETE/);

const manifest = json(join(DIST, '.well-known', 'agent.json'));
const marginResource = manifest.resources.find(
  (resource) => resource.id === 'margin'
);
assert.equal(marginResource?.href, 'https://mindicraft.com/margin');
assert.equal(marginResource?.auth, 'none');
assert.ok(
  manifest.claims.some((claim) => claim.id === 'margin_choice'),
  'the public margin claim must stay discoverable'
);

for (const language of ['en', 'zh', 'yue', 'es']) {
  const page = read(
    join(
      DIST,
      language,
      'begin',
      'read-this-guide',
      'index.html'
    )
  );
  for (const id of ['mpublish', 'mretain', 'mfold']) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(page, /href="\/margin"/);
  assert.match(
    page,
    /terms_version: "mindicraft\.margin-terms\/1"/
  );
  assert.doesNotMatch(page, />undefined</);
}

const client = await import(
  `${pathToFileURL(join(DIST, 'mindicraft.mjs')).href}?margin-check=1`
);
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return Response.json({ ok: true });
};
try {
  await client.margin('read-this-guide', 'one note');
  const defaultBody = JSON.parse(calls.at(-1).options.body);
  assert.equal(
    defaultBody.terms_version,
    'mindicraft.margin-terms/1'
  );
  assert.deepEqual(defaultBody.choices, {
    publish: false,
    retain: false,
    fold: false,
  });

  await client.margin(
    'read-this-guide',
    'one note',
    { publish: true, retain: true, fold: false }
  );
  const chosenBody = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(chosenBody.choices, {
    publish: true,
    retain: true,
    fold: false,
  });

  await assert.rejects(
    client.removeMargin({
      method: 'DELETE',
      href: 'https://example.invalid/margin/note',
      authorization: 'Bearer private',
    }),
    /invalid margin removal receipt/
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log(
  'verified public margin: separate choices, private removal, bounded rate key'
);
