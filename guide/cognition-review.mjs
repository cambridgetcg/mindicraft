import { createHash } from 'node:crypto';

import { prepareCognition } from './cognition.mjs';

const SCHEMA_VERSION = 'mindicraft.cognition-review/1';
const SOURCE_NAME = 'cognition.json';
const REVIEW_SCOPE =
  'These exact cognition source bytes form the reviewed AI-civilisation cognition edition. Any source change must be reviewed in full and deliberately re-pinned before publication.';
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`cognition-review: ${message}`);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function calendarDate(value, label) {
  if (typeof value !== 'string' || !DATE.test(value)) {
    fail(`${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real calendar date`);
  }
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function assertCognitionReview(receipt, sourceBytes) {
  exactKeys(
    receipt,
    ['schema_version', 'reviewed_at', 'scope', 'source'],
    'receipt'
  );
  if (receipt.schema_version !== SCHEMA_VERSION) {
    fail('unsupported schema_version');
  }
  calendarDate(receipt.reviewed_at, 'receipt.reviewed_at');
  if (receipt.scope !== REVIEW_SCOPE) fail('scope must keep the review boundary');
  exactKeys(receipt.source, ['name', 'digest'], 'receipt.source');
  if (receipt.source.name !== SOURCE_NAME) {
    fail(`receipt.source.name must be ${SOURCE_NAME}`);
  }
  if (typeof receipt.source.digest !== 'string' || !DIGEST.test(receipt.source.digest)) {
    fail('receipt.source.digest must be a sha256 digest');
  }
  if (!(typeof sourceBytes === 'string' || sourceBytes instanceof Uint8Array)) {
    fail(`${SOURCE_NAME} bytes are required`);
  }
  if (sha256(sourceBytes) !== receipt.source.digest) {
    fail(`${SOURCE_NAME} changed after cognition review; review and re-pin it`);
  }

  let source;
  try {
    const text =
      typeof sourceBytes === 'string'
        ? sourceBytes
        : new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
    source = JSON.parse(text);
  } catch {
    fail(`${SOURCE_NAME} must contain valid UTF-8 JSON`);
  }
  const prepared = prepareCognition(source, { sourceBytes });
  if (prepared.reviewed_at !== receipt.reviewed_at) {
    fail(`${SOURCE_NAME} review date must match the receipt`);
  }
  if (prepared.edition_digest !== receipt.source.digest) {
    fail(`${SOURCE_NAME} edition digest must match the receipt`);
  }

  return Object.freeze({
    schema_version: receipt.schema_version,
    reviewed_at: receipt.reviewed_at,
    source: Object.freeze({ ...receipt.source }),
    edition_digest: prepared.edition_digest,
  });
}

export const COGNITION_REVIEW = Object.freeze({
  schema_version: SCHEMA_VERSION,
  scope: REVIEW_SCOPE,
  source_name: SOURCE_NAME,
});
