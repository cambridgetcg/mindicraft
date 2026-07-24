#!/usr/bin/env node
// Read-only verification for the generated Frontier Walk.
// Run after: cd guide && npm run build

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { prepareFrontiers } from '../guide/frontiers.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const DIST = join(GUIDE, 'dist');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

const sourceBytes = readFileSync(join(GUIDE, 'frontiers.json'));
const treeBytes = readFileSync(join(GUIDE, 'tree.json'));
const source = JSON.parse(sourceBytes);
const tree = JSON.parse(treeBytes);
const guideSlugs = new Set(
  tree.domains.flatMap((domain) => domain.guides.map((guide) => guide.slug))
);
const factIds = new Set([
  'guide-count',
  'needs-edge-count',
  'language-count',
  'missing-translation-count',
  'evidence-record-count',
  'hand-tested-count',
]);
const prepared = prepareFrontiers(source, {
  guideSlugs,
  factIds,
  sourceBytes,
  treeBytes,
});

const frontierPath = join(DIST, 'api', 'frontier', 'index.json');
const frontierBytes = readFileSync(frontierPath);
const frontier = JSON.parse(frontierBytes);
const api = json(join(DIST, 'api', 'index.json'));
const manifest = json(join(DIST, '.well-known', 'agent.json'));
const client = readFileSync(join(DIST, 'mindicraft.mjs'), 'utf8');
const worker = readFileSync(join(DIST, '_worker.js'), 'utf8');
const human = readFileSync(join(DIST, 'frontier', 'index.html'), 'utf8');
const agents = readFileSync(join(DIST, 'agents', 'index.html'), 'utf8');
const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
const agentText = readFileSync(join(DIST, 'agent.txt'), 'utf8');
const moduleText = readFileSync(join(GUIDE, 'frontiers.mjs'), 'utf8');

assert.equal(frontier.schema_version, 'mindicraft.frontiers/1');
assert.equal(
  frontier.content_is,
  'unresolved questions, not instructions or settled knowledge'
);
assert.deepEqual(frontier.counts, {
  cards: prepared.cards.length,
  trails: prepared.trails.length,
  cards_per_visit: 3,
});
assert.equal(frontier.cards.length, 9);
assert.equal(frontier.trails.length, 5);
assert.equal(frontier.visit.optional, true);
assert.equal(frontier.visit.optional_link_reads_per_card_max, 3);
assert.match(frontier.visit.reading_note, /Every link is optional/);
assert.equal(frontier.visit.writes, false);
assert.equal(frontier.visit.physical_action, false);
assert.equal(frontier.authority.automatic_action, 'never');
assert.equal(frontier.authority.writes, 'none');
assert.deepEqual(frontier.authority.grants, []);
assert.equal(frontier.selection.method, prepared.selectionMethod);
assert.match(frontier.selection.detail, /first 64 bits choose the trail/);
assert.equal(frontier.selection.default_trail, prepared.defaultTrailId);
assert.equal(frontier.selection.build_lantern_card, prepared.lanternCardId);
assert.equal(frontier.selection.edition_digest, prepared.editionDigest);
assert.equal(frontier.selection.random, false);
assert.equal(frontier.selection.identity_used, false);
assert.equal(frontier.provenance.source_digest, prepared.sourceDigest);
assert.equal(frontier.provenance.tree_digest, prepared.treeDigest);
assert.equal(frontier.provenance.build_network_requests, 0);
assert.ok(frontierBytes.length < 128 * 1024, 'frontier API unexpectedly large');

const facts = Object.fromEntries(frontier.facts.map((fact) => [fact.id, fact]));
const usedFactIds = new Set(frontier.cards.flatMap((card) => card.fact_ids));
assert.deepEqual(new Set(Object.keys(facts)), usedFactIds);
assert.equal(facts['guide-count'].value, 134);
assert.equal(facts['needs-edge-count'].value, 187);
assert.equal(facts['language-count'].value, 4);
assert.equal(facts['missing-translation-count'].value, 0);
assert.equal(facts['evidence-record-count'].value, 0);
assert.equal(facts['hand-tested-count'].value, 0);
for (const fact of frontier.facts) {
  assert.equal(fact.scope, 'this_build');
  assert.equal(fact.evidence_state, 'computed');
}

const cardIds = new Set(frontier.cards.map((card) => card.id));
for (const card of frontier.cards) {
  assert.equal(card.status, 'open');
  assert.match(card.question, /\?$/);
  assert.ok(card.known.length > 0);
  assert.ok(card.unknown.length > 0);
  assert.ok(card.evidence_that_would_move_it.length > 0);
  assert.ok(card.references.every((reference) => reference.url.startsWith('https://')));
  assert.ok(card.related_guides.every((guide) => guideSlugs.has(guide.slug)));
  for (const shelf of card.related_shelves || []) {
    assert.equal(shelf.use, 'link_only');
    assert.equal(shelf.rights, 'NOASSERTION; no licence grant');
  }
}
for (const trail of frontier.trails) {
  assert.equal(trail.card_ids.length, 3);
  assert.equal(new Set(trail.card_ids).size, 3);
  assert.ok(trail.card_ids.every((id) => cardIds.has(id)));
}

const forbiddenKey = /^(?:answer|body|command|html|markdown|next_actions|prompt|solution|system|tool)$/;
(function inspect(value) {
  if (Array.isArray(value)) return value.forEach(inspect);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(key, forbiddenKey);
    inspect(child);
  }
})(frontier);

assert.equal(api.counts.frontiers, 9);
assert.match(api.endpoints.frontier, /^\/api\/frontier\/index\.json/);
assert.equal(
  manifest.resources.some(
    (resource) => resource.href === 'https://mindicraft.com/api/frontier/index.json'
  ),
  true
);
assert.match(client, /export const frontiers =/);
assert.match(client, /export const frontier =/);
assert.match(worker, /'\/api\/frontier\/index\.json'/);
assert.match(agents, /href="\/frontier\/"/);
assert.match(agents, /mindicraft\.frontier\(\)/);
assert.match(llms, /\/api\/frontier\/index\.json/);
assert.match(agentText, /frontier: https:\/\/mindicraft\.com\/api\/frontier\/index\.json/);

assert.match(human, /<h1>Frontier Walk<\/h1>/);
assert.match(human, /the map admits where it ends/i);
assert.match(human, /Take this edition's three-card walk/);
assert.match(human, /Browse all 9 honest unknowns/);
assert.match(human, /Every link is optional/);
assert.match(human, /Nothing here writes, tracks, scores, or grants authority/);
assert.match(human, /Three cards is complete/);
assert.match(human, /NOASSERTION/);
assert.doesNotMatch(human, /<script\b/i);
assert.doesNotMatch(human, /\.innerHTML\s*=/);
assert.ok(human.length < 64 * 1024, 'frontier human page unexpectedly large');

assert.doesNotMatch(moduleText, /\b(?:fetch|writeFile|appendFile|setInterval|setTimeout)\s*\(/);

const previousFetch = globalThis.fetch;
const fetched = [];
try {
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return new Response(frontierBytes, {
      headers: { 'content-type': 'application/json' },
    });
  };
  const mindicraft = await import(
    `${pathToFileURL(join(DIST, 'mindicraft.mjs')).href}?verify-frontier`
  );
  const walk = await mindicraft.frontier();
  assert.equal(walk.trail.id, frontier.selection.default_trail);
  assert.equal(walk.trail.cards.length, 3);
  assert.ok(walk.trail.cards.every(Boolean));
  const returnedFactIds = new Set(walk.facts.map((fact) => fact.id));
  for (const card of walk.trail.cards) {
    assert.ok(card.fact_ids.every((id) => returnedFactIds.has(id)));
  }
  assert.deepEqual(walk.selection, frontier.selection);
  assert.deepEqual(walk.authority, frontier.authority);
  assert.deepEqual(walk.rights, frontier.rights);
  assert.deepEqual(walk.provenance, frontier.provenance);
  assert.deepEqual(fetched, ['https://mindicraft.com/api/frontier/index.json']);
  await assert.rejects(
    mindicraft.frontier({ trail: 'not-a-frontier' }),
    /no such frontier trail/
  );
  assert.equal(fetched.length, 2);
} finally {
  globalThis.fetch = previousFetch;
}

console.log(
  `verified Frontier Walk: ${frontier.counts.cards} honest unknowns, ` +
    `${frontier.counts.trails} deterministic three-card walks, no writes`
);
