import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  WILDFIRE_REVIEW,
  assertWildfireReview,
} from '../guide/wildfire-review.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const receipt = JSON.parse(readFileSync(join(GUIDE, 'wildfire-review.json')));
const sourceBytes = { 'wildfire.json': readFileSync(join(GUIDE, 'wildfire.json')) };
const clone = (value) => JSON.parse(JSON.stringify(value));

test('the emergency review receipt pins the exact wildfire source bytes', () => {
  const prepared = assertWildfireReview(receipt, sourceBytes, {
    today: receipt.reviewed_at,
  });
  assert.equal(prepared.reviewed_at, receipt.reviewed_at);
  assert.equal(prepared.next_review_due, receipt.next_review_due);
  assert.deepEqual(prepared.sources, receipt.sources);
  assert.deepEqual(WILDFIRE_REVIEW.source_names, ['wildfire.json']);
});

test('any unreviewed wildfire source byte change fails before a public build', () => {
  const changed = {
    'wildfire.json': Buffer.concat([sourceBytes['wildfire.json'], Buffer.from(' ')]),
  };
  assert.throws(
    () => assertWildfireReview(receipt, changed, { today: receipt.reviewed_at }),
    /wildfire\.json changed after emergency review/u
  );
});

test('an overdue emergency edition fails closed', () => {
  const dayAfterDue = new Date(`${receipt.next_review_due}T00:00:00.000Z`);
  dayAfterDue.setUTCDate(dayAfterDue.getUTCDate() + 1);
  assert.throws(
    () =>
      assertWildfireReview(receipt, sourceBytes, {
        today: dayAfterDue.toISOString().slice(0, 10),
      }),
    /review expired/u
  );
});

test('the receipt schema, scope, dates, names, and digests fail closed', () => {
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.schema_version = 'mindicraft.wildfire-review/2'; },
    (value) => { value.scope = 'Changes are accepted automatically.'; },
    (value) => { value.reviewed_at = '2026-02-30'; },
    (value) => { value.next_review_due = value.reviewed_at; },
    (value) => { value.sources['wildfire.json'] = 'sha256:no'; },
    (value) => { value.sources['other.json'] = value.sources['wildfire.json']; },
  ]) {
    const changed = clone(receipt);
    mutate(changed);
    assert.throws(() =>
      assertWildfireReview(changed, sourceBytes, { today: receipt.reviewed_at })
    );
  }
});

test('receipt and source review dates cannot drift', () => {
  for (const field of ['reviewed_at', 'next_review_due']) {
    const changed = clone(receipt);
    changed[field] = field === 'reviewed_at' ? '2026-08-02' : '2026-09-04';
    assert.throws(() =>
      assertWildfireReview(changed, sourceBytes, { today: '2026-08-03' })
    );
  }
});
