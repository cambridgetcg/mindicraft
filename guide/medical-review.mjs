import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 'mindicraft.medical-review/1';
const REVIEW_SCOPE =
  'These exact source bytes form the reviewed medical edition. Any source change must be reviewed and deliberately re-pinned before the public build can proceed.';
const SOURCE_NAMES = ['remedies.json', 'healing-arts.json'];
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

const fail = (message) => {
  throw new Error(`medical-review: ${message}`);
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

const sha256 = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function assertMedicalReview(receipt, sourceBytesByName) {
  exactKeys(
    receipt,
    ['schema_version', 'reviewed_at', 'scope', 'sources'],
    'receipt'
  );
  if (receipt.schema_version !== SCHEMA_VERSION) {
    fail('unsupported schema_version');
  }
  if (!DATE.test(receipt.reviewed_at)) fail('reviewed_at must be YYYY-MM-DD');
  const reviewedAt = new Date(`${receipt.reviewed_at}T00:00:00.000Z`);
  if (
    Number.isNaN(reviewedAt.getTime()) ||
    reviewedAt.toISOString().slice(0, 10) !== receipt.reviewed_at
  ) {
    fail('reviewed_at must be a real calendar date');
  }
  if (receipt.scope !== REVIEW_SCOPE) fail('scope must keep the review boundary');
  exactKeys(receipt.sources, SOURCE_NAMES, 'receipt.sources');

  for (const name of SOURCE_NAMES) {
    const pinned = receipt.sources[name];
    if (typeof pinned !== 'string' || !DIGEST.test(pinned)) {
      fail(`receipt.sources.${name} must be a sha256 digest`);
    }
    const bytes = sourceBytesByName?.[name];
    if (!(typeof bytes === 'string' || bytes instanceof Uint8Array)) {
      fail(`${name} bytes are required`);
    }
    if (sha256(bytes) !== pinned) {
      fail(`${name} changed after medical review; review and re-pin it`);
    }
    let source;
    try {
      source = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      fail(`${name} must contain JSON`);
    }
    if (source.reviewed_at !== receipt.reviewed_at) {
      fail(`${name} review date must match the receipt`);
    }
  }

  return Object.freeze({
    schema_version: receipt.schema_version,
    reviewed_at: receipt.reviewed_at,
    sources: Object.freeze({ ...receipt.sources }),
  });
}

export const MEDICAL_REVIEW = Object.freeze({
  schema_version: SCHEMA_VERSION,
  scope: REVIEW_SCOPE,
  source_names: Object.freeze([...SOURCE_NAMES]),
});
