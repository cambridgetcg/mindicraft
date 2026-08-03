import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 'mindicraft.wildfire-review/1';
const REVIEW_SCOPE =
  'These exact wildfire-help source bytes form the reviewed emergency edition. Any source change must be reviewed and deliberately re-pinned before the public build can proceed.';
const SOURCE_NAME = 'wildfire.json';
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

const fail = (message) => {
  throw new Error(`wildfire-review: ${message}`);
};

const exactKeys = (value, keys, label) => {
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
};

const calendarDate = (value, label) => {
  if (typeof value !== 'string' || !DATE.test(value)) {
    fail(`${label} must be YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real calendar date`);
  }
  return date;
};

const sha256 = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function assertWildfireReview(receipt, sourceBytesByName, { today } = {}) {
  exactKeys(
    receipt,
    ['schema_version', 'reviewed_at', 'next_review_due', 'scope', 'sources'],
    'receipt'
  );
  if (receipt.schema_version !== SCHEMA_VERSION) {
    fail('unsupported schema_version');
  }
  const reviewedAt = calendarDate(receipt.reviewed_at, 'reviewed_at');
  const nextReviewDue = calendarDate(receipt.next_review_due, 'next_review_due');
  const buildDate = calendarDate(today, 'today');
  if (nextReviewDue <= reviewedAt) fail('next_review_due must follow reviewed_at');
  if (buildDate > nextReviewDue) {
    fail(`review expired on ${receipt.next_review_due}; review and re-pin it`);
  }
  if (receipt.scope !== REVIEW_SCOPE) fail('scope must keep the review boundary');
  exactKeys(receipt.sources, [SOURCE_NAME], 'receipt.sources');

  const pinned = receipt.sources[SOURCE_NAME];
  if (typeof pinned !== 'string' || !DIGEST.test(pinned)) {
    fail(`receipt.sources.${SOURCE_NAME} must be a sha256 digest`);
  }
  const bytes = sourceBytesByName?.[SOURCE_NAME];
  if (!(typeof bytes === 'string' || bytes instanceof Uint8Array)) {
    fail(`${SOURCE_NAME} bytes are required`);
  }
  if (sha256(bytes) !== pinned) {
    fail(`${SOURCE_NAME} changed after emergency review; review and re-pin it`);
  }

  let source;
  try {
    source = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    fail(`${SOURCE_NAME} must contain JSON`);
  }
  if (source.reviewed_at !== receipt.reviewed_at) {
    fail(`${SOURCE_NAME} review date must match the receipt`);
  }
  if (source.next_review_due !== receipt.next_review_due) {
    fail(`${SOURCE_NAME} next review date must match the receipt`);
  }

  return Object.freeze({
    schema_version: receipt.schema_version,
    reviewed_at: receipt.reviewed_at,
    next_review_due: receipt.next_review_due,
    sources: Object.freeze({ ...receipt.sources }),
  });
}

export const WILDFIRE_REVIEW = Object.freeze({
  schema_version: SCHEMA_VERSION,
  scope: REVIEW_SCOPE,
  source_names: Object.freeze([SOURCE_NAME]),
});
