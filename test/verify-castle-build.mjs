#!/usr/bin/env node
// Read-only verification for the canonical static Castle shelf.
// Run after: cd guide && npm run build

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const INDEX = join(REPO, 'index');
const DIST = join(REPO, 'guide', 'dist');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

const receipt = json(join(INDEX, '_castle-sync.json'));
const sourceFiles = readdirSync(INDEX)
  .filter((file) => /^castle-(?:room|word)-.+\.json$/u.test(file))
  .sort();
const source = sourceFiles.map((file) => json(join(INDEX, file)));
const shelfPath = join(DIST, 'api', 'castle', 'index.json');
const shelfBytes = readFileSync(shelfPath);
const shelf = JSON.parse(shelfBytes);
const api = json(join(DIST, 'api', 'index.json'));
const manifest = json(join(DIST, '.well-known', 'agent.json'));
const client = readFileSync(join(DIST, 'mindicraft.mjs'), 'utf8');
const worker = readFileSync(join(DIST, '_worker.js'), 'utf8');
const castleDoorPath = join(DIST, 'castle', 'index.html');
const agentsPath = join(DIST, 'agents', 'index.html');
const sourceById = new Map(source.map((entry) => [entry.id, entry]));
const compactKeys = ['api', 'id', 'kind', 'slug', 'summary', 'title', 'url'];

assert.equal(source.length, receipt.counts.entries);
assert.equal(shelf.count, source.length);
assert.deepEqual(shelf.counts, receipt.counts);
assert.equal(shelf.entries_digest, receipt.entries_digest);
assert.match(shelf.entries_digest_scope, /full generated source metadata cards/);
assert.deepEqual(shelf.rights, receipt.rights);
assert.deepEqual(shelf.authority, receipt.authority);
assert.deepEqual(shelf.return, receipt.return);
assert.deepEqual(shelf.source, receipt.source);
assert.deepEqual(shelf.privacy, receipt.privacy);
assert.equal(receipt.privacy.scope, 'public_curated');
assert.equal(receipt.privacy.raw_source_included, false);
assert.equal(receipt.privacy.curation_profile, 'castle-gate-public/v1');
assert.equal(receipt.privacy.coverage, 'not_exhaustive');
assert.equal(receipt.privacy.secure_recall, 'not_guaranteed');
assert.match(receipt.source.manifest_revision, /^[0-9a-f]{40}$/);
assert.match(receipt.source.manifest_digest, /^sha256:[0-9a-f]{64}$/);
assert.match(receipt.source.payload_digest, /^sha256:[0-9a-f]{64}$/);
assert.deepEqual(
  shelf.entries.map((entry) => entry.id),
  source.map((entry) => entry.id).sort()
);

const forbidden = /^(?:body|bodyHtml|body_markdown|content|html|markdown)$/i;
let individualBytes = 0;
for (const entry of shelf.entries) {
  assert.deepEqual(Object.keys(entry).sort(), compactKeys, `${entry.id} is not compact`);
  const sourceEntry = sourceById.get(entry.id);
  assert.ok(sourceEntry, `${entry.id} has no generated source card`);
  assert.deepEqual(entry, {
    id: sourceEntry.id,
    kind: sourceEntry.kind,
    slug: sourceEntry.slug,
    title: sourceEntry.title,
    summary: sourceEntry.summary,
    url: sourceEntry.url,
    api:
      `/api/castle/${sourceEntry.kind === 'room' ? 'rooms' : 'words'}/` +
      `${encodeURIComponent(sourceEntry.slug)}.json`,
  });

  const individualPath = join(
    DIST,
    'api',
    'castle',
    entry.kind === 'room' ? 'rooms' : 'words',
    `${entry.slug}.json`
  );
  assert.equal(existsSync(individualPath), true, `missing ${entry.api}`);
  const individualRaw = readFileSync(individualPath);
  individualBytes += individualRaw.length;
  const individual = JSON.parse(individualRaw);
  assert.deepEqual(individual, { ...sourceEntry, api: entry.api });
  assert.equal(
    Object.keys(individual).some((key) => forbidden.test(key)),
    false,
    `${entry.id} carries body content`
  );
  assert.equal(individual.rights.spdx, receipt.rights.spdx);
  assert.equal(individual.rights.grant, receipt.rights.grant);
  assert.equal(individual.authority.automatic_action, 'never');
  assert.equal(individual.castle.automatic_return_ingest, false);
  assert.equal(individual.castle.manifest_path, receipt.source.manifest_path);
  assert.equal(individual.castle.manifest_revision, receipt.source.manifest_revision);
  assert.equal(individual.castle.manifest_digest, receipt.source.manifest_digest);
  assert.equal(individual.castle.correction, receipt.return.public_correction);
}

assert.ok(
  shelfBytes.length < individualBytes / 3,
  `Castle discovery index is not compact (${shelfBytes.length} bytes for ${individualBytes} bytes of individual cards)`
);
assert.ok(
  shelfBytes.length <= 16_384 + source.length * 900,
  `Castle discovery index exceeds its 900-byte-per-entry bound (${shelfBytes.length} bytes)`
);

assert.deepEqual(api.counts.castle, receipt.counts);
assert.match(api.endpoints.castle, /^\/api\/castle\/index\.json/);
assert.match(api.rules, /NOASSERTION/);
assert.equal(
  manifest.resources.some(
    (resource) => resource.href === 'https://mindicraft.com/api/castle/index.json'
  ),
  true
);
assert.match(client, /export const castle =/);
assert.match(client, /export const castleEntry =/);
assert.match(worker, /'\/api\/castle\/index\.json'/);

assert.equal(existsSync(castleDoorPath), true, 'missing /castle/ human doorway');
const castleDoor = readFileSync(castleDoorPath, 'utf8');
const agents = readFileSync(agentsPath, 'utf8');
assert.match(castleDoor, /This is a map, not the Castle of Understanding/);
assert.match(castleDoor, /https:\/\/cambridgetcg\.github\.io\/castle-gate\//);
assert.match(castleDoor, /public curated material only/i);
assert.match(castleDoor, /not exhaustive/i);
assert.match(castleDoor, /secure\s+recall is not guaranteed/i);
assert.match(castleDoor, /NOASSERTION/);
assert.match(castleDoor, /no licence is declared/i);
assert.match(castleDoor, /\/api\/castle\/index\.json/);
assert.match(castleDoor, /aria-live="polite"/);
assert.match(castleDoor, /<fieldset class="castle-filters">/);
assert.match(castleDoor, /\.textContent\s*=/);
assert.match(castleDoor, /replaceChildren\(/);
assert.doesNotMatch(castleDoor, /\.innerHTML\s*=/);
assert.doesNotMatch(castleDoor, /<script[^>]+\bsrc=/i);
assert.ok(castleDoor.length < 30_000, 'human doorway unexpectedly embeds the Castle data');
assert.match(agents, /href="\/castle\/"/);

console.log(
  `verified canonical Castle shelf: ${receipt.counts.rooms} rooms + ` +
    `${receipt.counts.words} words = ${receipt.counts.entries} entries, with its human doorway`
);
