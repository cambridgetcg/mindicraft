// Read-only verification for the generated Healing arts history companion.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareHealingArts } from '../guide/healing-arts.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(ROOT, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const readJson = (path) => JSON.parse(read(path));
const esc = (value = '') =>
  String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
const words = (value) => String(value).replaceAll('_', ' ').replaceAll('-', ' ');

const sourceBytes = readFileSync(join(GUIDE, 'healing-arts.json'));
const source = JSON.parse(sourceBytes.toString('utf8'));
const remedySource = readJson(join(GUIDE, 'remedies.json'));
const prepared = prepareHealingArts(source, { sourceBytes });
const payloadPath = join(DIST, 'api', 'remedies', 'healing-arts', 'index.json');
const pagePath = join(DIST, 'remedies', 'healing-arts', 'index.html');
const payloadBytes = readFileSync(payloadPath);
const payload = JSON.parse(payloadBytes.toString('utf8'));
const html = read(pagePath);
const remediesIndex = read(join(DIST, 'remedies', 'index.html'));
const apiIndex = readJson(join(DIST, 'api', 'index.json'));
const manifest = readJson(join(DIST, '.well-known', 'agent.json'));
const client = read(join(DIST, 'mindicraft.mjs'));
const llms = read(join(DIST, 'llms.txt'));
const agent = read(join(DIST, 'agent.txt'));
const agentPage = read(join(DIST, 'agents', 'index.html'));
const worker = read(join(DIST, '_worker.js'));

assert.equal(payload.schema_version, 'mindicraft.healing-arts/1');
assert.equal(payload.count, 14);
assert.equal(payload.count, prepared.counts.traditions);
assert.deepEqual(payload.traditions, source.traditions);
assert.deepEqual(payload.sources, source.sources);
assert.deepEqual(payload.boundary, source.boundary);
assert.deepEqual(payload.authority, source.authority);
assert.deepEqual(payload.rights, source.rights);
assert.equal(payload.correction, source.correction);
assert.deepEqual(payload.provenance, {
  source: 'guide/healing-arts.json',
  source_digest: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
  reviewed_at: source.reviewed_at,
  build_network_requests: 0,
});
assert.ok(payloadBytes.length < 128 * 1024, 'healing-arts JSON unexpectedly large');

assert.match(html, /<h1>Healing arts across cultures<\/h1>/u);
assert.match(html, /There was no single ancient science called alchemy/u);
assert.match(html, /Living knowledge:/u);
assert.match(html, /History, not a treatment or material-practice guide/u);
assert.match(html, /href="\/api\/remedies\/healing-arts\/index\.json"/u);
assert.ok(
  html.includes(`href="${esc(source.correction)}"`),
  'the human history page must keep its correction door'
);
assert.doesNotMatch(html, /<(?:script|form|button|input|textarea|iframe|object|embed)\b/iu);
assert.doesNotMatch(html, /\son[a-z]+\s*=/iu);
assert.ok(html.length < 256 * 1024, 'healing-arts page unexpectedly large');

for (const tradition of source.traditions) {
  assert.match(html, new RegExp(`id="${tradition.id}"`, 'u'));
  assert.ok(html.includes(esc(tradition.name)), `missing tradition ${tradition.id}`);
  for (const [name, context] of [
    ['place period', tradition.place_period],
    ['scope note', tradition.scope_note],
  ]) {
    assert.ok(html.includes(esc(context.text)), `missing ${name} ${tradition.id}`);
    for (const sourceId of context.source_ids) {
      assert.ok(
        html.includes(`href="#healing-source-${esc(sourceId)}"`),
        `missing ${name} source ${sourceId}`
      );
    }
  }
  for (const [name, claims] of [
    ['healing aim', tradition.healing_aims],
    ['durable contribution', tradition.durable_contributions],
    ['limit or harm', tradition.limits_and_harms],
    ['modern boundary', [tradition.modern_boundary]],
  ]) {
    for (const claimValue of claims) {
      assert.ok(html.includes(esc(claimValue.text)), `missing ${name} ${tradition.id}`);
      assert.ok(
        html.includes(`<small>${esc(words(claimValue.evidence_state))}</small>`),
        `missing ${name} evidence state ${tradition.id}`
      );
      for (const sourceId of claimValue.source_ids) {
        assert.ok(
          html.includes(`href="#healing-source-${esc(sourceId)}"`),
          `missing ${name} source ${sourceId}`
        );
      }
    }
  }
}
for (const sourceRecord of source.sources) {
  assert.match(html, new RegExp(`id="healing-source-${sourceRecord.id}"`, 'u'));
  assert.ok(html.includes(esc(sourceRecord.url)), `missing source URL ${sourceRecord.id}`);
}

const healingSourceByUrl = new Map(source.sources.map((entry) => [entry.url, entry]));
const healingSourceById = new Map(source.sources.map((entry) => [entry.id, entry]));
for (const remedySourceRecord of remedySource.sources) {
  const sameId = healingSourceById.get(remedySourceRecord.id);
  if (sameId) {
    for (const field of ['title', 'publisher', 'url', 'observed_at']) {
      assert.equal(
        remedySourceRecord[field],
        sameId[field],
        `shared source id names different records: ${remedySourceRecord.id} (${field})`
      );
    }
  }
  const healingSourceRecord = healingSourceByUrl.get(remedySourceRecord.url);
  if (!healingSourceRecord) continue;
  for (const field of ['title', 'publisher', 'observed_at']) {
    assert.equal(
      remedySourceRecord[field],
      healingSourceRecord[field],
      `shared source metadata drifted for ${remedySourceRecord.url}: ${field}`
    );
  }
}

assert.match(remediesIndex, /href="\/remedies\/healing-arts\/"/u);
assert.equal(apiIndex.counts.healing_art_traditions, 14);
assert.match(
  apiIndex.endpoints.healing_arts,
  /^\/api\/remedies\/healing-arts\/index\.json/u
);
assert.match(apiIndex.humans, /\/remedies\/healing-arts\//u);

const resource = manifest.resources.find((entry) => entry.id === 'healing-arts');
assert.equal(resource?.href, 'https://mindicraft.com/remedies/healing-arts/');
assert.deepEqual(resource?.representations, ['text/html', 'application/json']);
assert.equal(resource?.auth, 'none');
const claim = manifest.claims.find((entry) => entry.id === 'healing_arts_read_only');
assert.deepEqual(claim?.scope, [
  'GET https://mindicraft.com/remedies/healing-arts/',
  'GET https://mindicraft.com/api/remedies/healing-arts/index.json',
]);
assert.match(claim?.statement ?? '', /no diagnosis, dose, recipe, extraction, treatment/u);
assert.match(claim?.statement ?? '', /living Indigenous knowledge/u);

assert.match(
  client,
  /export const healingArts = \(\) => get\('\/api\/remedies\/healing-arts\/index\.json'\)/u
);
assert.match(llms, /\/api\/remedies\/healing-arts\/index\.json/u);
assert.match(llms, /Alchemy is not a universal name for ancient medicine/u);
assert.match(agent, /healing arts: https:\/\/mindicraft\.com\/remedies\/healing-arts\//u);
assert.match(agentPage, /mindicraft\.healingArts\(\)/u);
assert.match(worker, /'\/remedies\/healing-arts\/': \{ reps: \['text\/html', 'application\/json'\]/u);
assert.match(worker, /jsonAsset: '\/api\/remedies\/healing-arts\/index\.json'/u);

console.log(
  `verified Healing arts: ${payload.count} source-bound records and living contexts, ` +
    `${payload.sources.length} sources, non-operational and read-only`
);
