import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { COGNITION, prepareCognition } from '../guide/cognition.mjs';
import {
  COGNITION_REVIEW,
  assertCognitionReview,
} from '../guide/cognition-review.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const sourceBytes = readFileSync(join(GUIDE, 'cognition.json'));
const source = JSON.parse(sourceBytes);
const receipt = JSON.parse(readFileSync(join(GUIDE, 'cognition-review.json')));
const clone = (value) => JSON.parse(JSON.stringify(value));
const bytesFor = (value) => Buffer.from(JSON.stringify(value));

test('the first cognition edition is a nine-dimension map without a score', () => {
  const prepared = prepareCognition(source, { sourceBytes });

  assert.equal(prepared.schema_version, 'mindicraft.cognition/1');
  assert.deepEqual(prepared.counts, {
    dimensions: 9,
    scopes: 3,
    observations: 7,
    gaps: 9,
    sources: 8,
  });
  assert.deepEqual(
    prepared.dimensions.map((entry) => entry.id),
    COGNITION.dimension_ids
  );
  assert.deepEqual(
    prepared.scopes.map((entry) => entry.id),
    ['system', 'agent', 'collective']
  );
  assert.deepEqual(
    prepared.scopes.find((entry) => entry.id === 'collective').observation_ids,
    []
  );
  assert.equal(
    prepared.dimensions.find((entry) => entry.id === 'memory-continuity')
      .observation_ids.length,
    0
  );
  assert.ok(prepared.dimensions.every((entry) => entry.gap_ids.length === 1));
  assert.deepEqual(prepared.boundaries, {
    aggregate_score: 'never',
    scores_beings: false,
    human_equivalence: 'task_bound_only',
    missing_means_zero: false,
    consciousness_inferred: false,
    authority_granted: false,
    learning_state_included: false,
    automatic_action: 'never',
    application_tracking_added: false,
    update_mode: 'manual_review_only',
  });
  for (const forbidden of [
    'aggregate_score',
    'composite_score',
    'intelligence_level',
    'overall_rank',
    'overall_score',
  ]) {
    assert.equal(forbidden in prepared, false);
  }
});

test('human references remain exact task-bound comparisons', () => {
  const prepared = prepareCognition(source, { sourceBytes });
  const byId = new Map(prepared.observations.map((entry) => [entry.id, entry]));

  assert.match(
    byId.get('alphacode-codeforces-2022').result,
    /top 54%/u
  );
  assert.match(
    byId.get('gpt-4-uniform-bar-2023').human_reference.boundary,
    /not admission to practice law/u
  );
  assert.match(
    byId.get('gpt-4v-mmmu-2024').human_reference.comparison,
    /76\.2%.*82\.6%.*88\.6%/u
  );
  assert.match(
    byId.get('alphageometry-imo-ag-30-2024').human_reference.boundary,
    /geometry-only/u
  );
  assert.equal(
    byId.get('gpt-5-metr-2025').lineage.previous_id,
    'claude-3-7-metr-2025'
  );
  assert.equal(
    byId.get('gpt-5-1-codex-max-metr-2025').lineage.previous_id,
    'gpt-5-metr-2025'
  );
});

test('the source schema fails closed around dimensions, lineage, gaps, and sources', () => {
  const mutations = [
    (value) => { value.extra = true; },
    (value) => { value.dimensions[0].id = 'general-intelligence'; },
    (value) => { value.observations[0].source_ids = ['missing-source']; },
    (value) => { value.observations[5].lineage.previous_id = null; },
    (value) => { value.observations[5].dimension_id = 'novel-reasoning'; },
    (value) => { value.observations[1].aggregate_score = 90; },
    (value) => { value.gaps.pop(); },
    (value) => { value.sources[0].url = 'https://example.com/report'; },
    (value) => {
      value.sources.push({ ...value.sources[0], id: 'unused-source' });
    },
  ];

  for (const mutate of mutations) {
    const changed = clone(source);
    mutate(changed);
    assert.throws(() =>
      prepareCognition(changed, { sourceBytes: bytesFor(changed) })
    );
  }
});

test('the object and the source bytes cannot drift apart', () => {
  const changed = clone(source);
  changed.title = 'A different map';
  assert.throws(
    () => prepareCognition(changed, { sourceBytes }),
    /sourceBytes must be the exact bytes parsed as source/u
  );
});

test('the review receipt pins the exact cognition bytes', () => {
  const reviewed = assertCognitionReview(receipt, sourceBytes);

  assert.equal(reviewed.reviewed_at, source.reviewed_at);
  assert.equal(reviewed.edition_digest, receipt.source.digest);
  assert.equal(COGNITION_REVIEW.source_name, 'cognition.json');

  const changedBytes = Buffer.concat([sourceBytes, Buffer.from(' ')]);
  assert.throws(
    () => assertCognitionReview(receipt, changedBytes),
    /cognition\.json changed after cognition review/u
  );
});

test('the review receipt schema and review boundary fail closed', () => {
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.schema_version = 'mindicraft.cognition-review/2'; },
    (value) => { value.reviewed_at = '2026-02-30'; },
    (value) => { value.scope = 'Changes are accepted automatically.'; },
    (value) => { value.source.name = 'other.json'; },
    (value) => { value.source.digest = 'sha256:no'; },
  ]) {
    const changed = clone(receipt);
    mutate(changed);
    assert.throws(() => assertCognitionReview(changed, sourceBytes));
  }
});
