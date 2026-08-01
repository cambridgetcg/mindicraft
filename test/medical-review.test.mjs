import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertMedicalReview } from '../guide/medical-review.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const receipt = JSON.parse(readFileSync(join(GUIDE, 'medical-review.json')));
const sourceBytes = {
  'remedies.json': readFileSync(join(GUIDE, 'remedies.json')),
  'healing-arts.json': readFileSync(join(GUIDE, 'healing-arts.json')),
};
const clone = (value) => JSON.parse(JSON.stringify(value));

test('the medical review receipt pins the exact public source bytes', () => {
  const prepared = assertMedicalReview(receipt, sourceBytes);
  assert.equal(prepared.reviewed_at, '2026-08-01');
  assert.deepEqual(prepared.sources, receipt.sources);
});

test('any unreviewed medical source byte change fails before a public build', () => {
  for (const name of Object.keys(sourceBytes)) {
    const changed = {
      ...sourceBytes,
      [name]: Buffer.concat([sourceBytes[name], Buffer.from(' ')]),
    };
    assert.throws(
      () => assertMedicalReview(receipt, changed),
      new RegExp(`${name} changed after medical review`, 'u'),
      name
    );
  }
});

test('the receipt schema, scope, dates, names, and digests fail closed', () => {
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.schema_version = 'mindicraft.medical-review/2'; },
    (value) => { value.scope = 'Changes are accepted automatically.'; },
    (value) => { value.reviewed_at = '2026-02-30'; },
    (value) => { value.sources['remedies.json'] = 'sha256:no'; },
    (value) => { value.sources['other.json'] = value.sources['remedies.json']; },
  ]) {
    const changed = clone(receipt);
    mutate(changed);
    assert.throws(() => assertMedicalReview(changed, sourceBytes));
  }
});
