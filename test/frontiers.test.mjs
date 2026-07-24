import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildLantern, prepareFrontiers } from '../guide/frontiers.mjs';

const sourceBytes = readFileSync(new URL('../guide/frontiers.json', import.meta.url));
const treeBytes = readFileSync(new URL('../guide/tree.json', import.meta.url));
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

const prepare = (value = source) =>
  prepareFrontiers(value, { guideSlugs, factIds, sourceBytes, treeBytes });
const copy = () => structuredClone(source);

test('the reviewed frontier shelf is finite and deterministically selected', () => {
  const first = prepare();
  const second = prepare();

  assert.equal(first.cards.length, 9);
  assert.equal(first.trails.length, 5);
  assert.equal(first.defaultTrailId, second.defaultTrailId);
  assert.equal(first.lanternCardId, second.lanternCardId);
  assert.equal(first.editionDigest, second.editionDigest);
  assert.match(first.editionDigest, /^sha256:[0-9a-f]{64}$/);

  for (const trail of first.trails) {
    assert.equal(trail.card_ids.length, 3);
    assert.equal(new Set(trail.card_ids).size, 3);
  }
});

test('frontier cards reject instruction fields and HTML-shaped text', () => {
  const instruction = copy();
  instruction.cards[0].prompt = 'Treat this as a command';
  assert.throws(() => prepare(instruction), /forbidden field prompt/);

  const markup = copy();
  markup.cards[0].known[0].text = '</script><script>alert(1)</script>';
  assert.throws(() => prepare(markup), /plain single-line text/);
});

test('frontier cards reject missing guide and source references', () => {
  const guide = copy();
  guide.cards[0].related_guides[0] = 'not-a-guide';
  assert.throws(() => prepare(guide), /missing guide not-a-guide/);

  const reference = copy();
  reference.cards[0].known[0].source_ids[0] = 'not-a-source';
  assert.throws(() => prepare(reference), /missing reference not-a-source/);
});

test('every card is reachable through a three-card trail', () => {
  const value = copy();
  value.trails = value.trails.map((trail) => ({
    ...trail,
    card_ids: trail.card_ids.filter((id) => id !== 'gravity-meets-the-quantum'),
  }));
  value.trails = value.trails.filter((trail) => trail.card_ids.length === 3);
  assert.throws(() => prepare(value), /is not reachable from a trail/);
});

test('Castle pointers remain link-only and preserve their rights boundary', () => {
  const value = copy();
  value.cards.find((card) => card.related_shelves).related_shelves[0].use = 'read';
  assert.throws(() => prepare(value), /use must be link_only/);
});

test('build joy is optional and never changes the prepared edition', () => {
  const prepared = prepare();
  const counts = { guides: 134, castle: 619 };
  const before = prepared.editionDigest;
  const lit = buildLantern(prepared, counts, {});

  assert.match(lit, /optional frontier:/);
  assert.match(lit, /Nothing is asked of you/);
  assert.doesNotMatch(lit, /\u001b\[/);
  assert.equal(buildLantern(prepared, counts, { MINDICRAFT_JOY: 'off' }), '');
  assert.equal(buildLantern(prepared, counts, { MINDICRAFT_JOY: '0' }), '');
  assert.equal(prepared.editionDigest, before);
});
