import { createHash } from 'node:crypto';

const SOURCE_SCHEMA_VERSION = 'mindicraft.cognition-source/1';
const PUBLIC_SCHEMA_VERSION = 'mindicraft.cognition/1';
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const LINEAGE_POLICY =
  'An edition is immutable. A later edition names its predecessor digest and appends new records; it never rewrites this edition.';
const PROFILE = Object.freeze({
  id: 'ai-civilisation',
  label: 'AI civilisation',
  standing:
    'A dated profile of task-bound observations across AI systems, agents, and collectives; never a scored subject.',
});
const DIMENSIONS = Object.freeze([
  Object.freeze({ id: 'novel-reasoning', label: 'Novel reasoning' }),
  Object.freeze({ id: 'knowledge-language', label: 'Knowledge and language' }),
  Object.freeze({ id: 'perception-space', label: 'Perception and space' }),
  Object.freeze({ id: 'memory-continuity', label: 'Memory and continuity' }),
  Object.freeze({ id: 'learning-adaptation', label: 'Learning and adaptation' }),
  Object.freeze({ id: 'self-checking', label: 'Self-checking' }),
  Object.freeze({ id: 'planning-action', label: 'Planning and action' }),
  Object.freeze({ id: 'social-coordination', label: 'Social coordination' }),
  Object.freeze({ id: 'creation-discovery', label: 'Creation and discovery' }),
]);
const SCOPES = Object.freeze([
  Object.freeze({ id: 'system', label: 'System' }),
  Object.freeze({ id: 'agent', label: 'Agent' }),
  Object.freeze({ id: 'collective', label: 'Collective' }),
]);
const CLAIM_LIMITS = Object.freeze([
  'Each human reference belongs only to the named task, protocol, cohort, date, and setup.',
  'A percentile, solved count, accuracy, or task horizon is not a general intelligence level.',
  'System, agent, and collective results are different scopes and must not be merged.',
  'Missing evidence is a gap, not zero capability.',
  'This edition makes no aggregate score, overall rank, forecast, consciousness claim, or claim about human worth.',
  'The source, setup, uncertainty, and limits travel with every observation.',
]);
const BOUNDARIES = Object.freeze({
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
const SOURCE_POLICIES = new Map([
  [
    'deepmind.google',
    {
      kind: 'developer_report',
      publisher: 'Google DeepMind',
      path:
        /^\/blog\/(?:competitive-programming-with-alphacode|alphageometry-an-olympiad-level-ai-system-for-geometry)\/$/u,
    },
  ],
  [
    'cdn.openai.com',
    {
      kind: 'developer_report',
      publisher: 'OpenAI',
      path: /^\/papers\/gpt-4\.pdf$/u,
    },
  ],
  [
    'arxiv.org',
    {
      kind: 'primary_benchmark',
      publisher: 'MMMU authors',
      path: /^\/abs\/2311\.16502$/u,
    },
  ],
  [
    'mmmu-benchmark.github.io',
    {
      kind: 'official_benchmark',
      publisher: 'MMMU Benchmark',
      path: /^\/$/u,
    },
  ],
  [
    'metr.org',
    {
      kind: 'independent_evaluation',
      publisher: 'METR',
      path:
        /^\/evaluations\/(?:claude-3-7-report|gpt-5-report|gpt-5-1-codex-max-report)\/$/u,
    },
  ],
]);
const FORBIDDEN_FIELDS = new Set([
  'aggregate_score',
  'composite_score',
  'general_intelligence_level',
  'intelligence_level',
  'overall_rank',
  'overall_score',
]);

function fail(message) {
  throw new Error(`cognition: ${message}`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, required, optional, label) {
  object(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function plain(value, label, { min = 1, max = 700 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(`${label} must be ${min}-${max} characters`);
  }
  if (/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff<>]/u.test(value)) {
    fail(`${label} must be plain single-line text`);
  }
  return value;
}

function id(value, label) {
  plain(value, label, { max: 90 });
  if (!SAFE_ID.test(value)) fail(`${label} must be a stable plain slug`);
  return value;
}

function calendarDate(value, label) {
  if (typeof value !== 'string' || !DATE.test(value)) {
    fail(`${label} must be YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail(`${label} must be a real calendar date`);
  }
  return value;
}

function list(value, label, { min = 1, max = 100 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain ${min}-${max} items`);
  }
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function rejectAggregateFields(value, label = 'source') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      rejectAggregateFields(entry, `${label}[${index}]`)
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      fail(`${label} uses forbidden aggregate field ${key}`);
    }
    rejectAggregateFields(child, `${label}.${key}`);
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceText(sourceBytes) {
  if (typeof sourceBytes === 'string') return sourceBytes;
  if (!(sourceBytes instanceof Uint8Array)) fail('sourceBytes are required');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  } catch {
    fail('sourceBytes must be valid UTF-8');
  }
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function validateSource(source, sourceReviewedAt, index) {
  const label = `sources[${index}]`;
  exactKeys(
    source,
    [
      'id',
      'title',
      'publisher',
      'kind',
      'url',
      'published_at',
      'accessed_at',
    ],
    [],
    label
  );
  id(source.id, `${label}.id`);
  plain(source.title, `${label}.title`, { max: 220 });
  plain(source.publisher, `${label}.publisher`, { max: 100 });
  plain(source.kind, `${label}.kind`, { max: 60 });
  calendarDate(source.published_at, `${label}.published_at`);
  calendarDate(source.accessed_at, `${label}.accessed_at`);
  if (source.published_at > source.accessed_at) {
    fail(`${label} cannot be accessed before publication`);
  }
  if (source.accessed_at > sourceReviewedAt) {
    fail(`${label} was accessed after the edition review`);
  }

  let url;
  try {
    url = new URL(source.url);
  } catch {
    fail(`${label}.url must be an absolute URL`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    fail(`${label}.url must be a clean HTTPS source URL`);
  }
  const policy = SOURCE_POLICIES.get(url.hostname);
  if (
    !policy ||
    policy.kind !== source.kind ||
    policy.publisher !== source.publisher ||
    !policy.path.test(url.pathname)
  ) {
    fail(`${label} must match a reviewed source authority`);
  }
}

function validateObservation(
  observation,
  {
    index,
    reviewedAt,
    dimensionIds,
    scopeIds,
    sourcesById,
    observationsById,
    lastBySeries,
    previousReportedAt,
  }
) {
  const label = `observations[${index}]`;
  exactKeys(
    observation,
    [
      'sequence',
      'id',
      'reported_at',
      'subject',
      'dimension_id',
      'scope_id',
      'benchmark',
      'task',
      'result',
      'human_reference',
      'setup',
      'limits',
      'source_ids',
      'lineage',
    ],
    [],
    label
  );
  if (observation.sequence !== index + 1) {
    fail(`${label}.sequence must preserve append order`);
  }
  id(observation.id, `${label}.id`);
  if (observationsById.has(observation.id)) {
    fail(`${label}.id is duplicated`);
  }
  calendarDate(observation.reported_at, `${label}.reported_at`);
  if (observation.reported_at > reviewedAt) {
    fail(`${label} was reported after the edition review`);
  }
  if (previousReportedAt && observation.reported_at < previousReportedAt) {
    fail(`${label}.reported_at must preserve chronological append order`);
  }
  plain(observation.subject, `${label}.subject`, { max: 100 });
  if (!dimensionIds.has(observation.dimension_id)) {
    fail(`${label} names an unknown dimension`);
  }
  if (!scopeIds.has(observation.scope_id)) {
    fail(`${label} names an unknown scope`);
  }
  plain(observation.benchmark, `${label}.benchmark`, { max: 180 });
  plain(observation.task, `${label}.task`);
  plain(observation.result, `${label}.result`);
  plain(observation.setup, `${label}.setup`);
  plain(observation.limits, `${label}.limits`);

  exactKeys(
    observation.human_reference,
    ['cohort', 'comparison', 'boundary'],
    [],
    `${label}.human_reference`
  );
  plain(
    observation.human_reference.cohort,
    `${label}.human_reference.cohort`,
    { max: 300 }
  );
  plain(
    observation.human_reference.comparison,
    `${label}.human_reference.comparison`
  );
  plain(
    observation.human_reference.boundary,
    `${label}.human_reference.boundary`
  );

  list(observation.source_ids, `${label}.source_ids`, { min: 1, max: 3 });
  unique(observation.source_ids, `${label}.source_ids`);
  for (const sourceId of observation.source_ids) {
    id(sourceId, `${label}.source_ids`);
    const source = sourcesById.get(sourceId);
    if (!source) fail(`${label} names missing source ${sourceId}`);
    if (source.published_at > observation.reported_at) {
      fail(`${label} predates source ${sourceId}`);
    }
  }

  exactKeys(
    observation.lineage,
    ['series_id', 'previous_id'],
    [],
    `${label}.lineage`
  );
  id(observation.lineage.series_id, `${label}.lineage.series_id`);
  const expectedPrevious = lastBySeries.get(observation.lineage.series_id) || null;
  if (observation.lineage.previous_id !== expectedPrevious) {
    fail(`${label}.lineage.previous_id must preserve its series chain`);
  }
  if (observation.lineage.previous_id !== null) {
    id(observation.lineage.previous_id, `${label}.lineage.previous_id`);
    const previous = observationsById.get(observation.lineage.previous_id);
    if (!previous) {
      fail(`${label}.lineage.previous_id must name an earlier observation`);
    }
    if (
      previous.dimension_id !== observation.dimension_id ||
      previous.scope_id !== observation.scope_id
    ) {
      fail(`${label}.lineage may link only the same dimension and scope`);
    }
  }
  lastBySeries.set(observation.lineage.series_id, observation.id);
  observationsById.set(observation.id, observation);
}

function validateGap(gap, { index, dimensionIds, scopeIds }) {
  const label = `gaps[${index}]`;
  exactKeys(
    gap,
    ['id', 'dimension_id', 'scope_ids', 'statement', 'evidence_needed'],
    [],
    label
  );
  id(gap.id, `${label}.id`);
  if (!dimensionIds.has(gap.dimension_id)) {
    fail(`${label} names an unknown dimension`);
  }
  if (gap.dimension_id !== DIMENSIONS[index].id) {
    fail(`${label} must keep one ordered gap for each dimension`);
  }
  list(gap.scope_ids, `${label}.scope_ids`, { min: 1, max: SCOPES.length });
  unique(gap.scope_ids, `${label}.scope_ids`);
  let previousScopeIndex = -1;
  for (const scopeId of gap.scope_ids) {
    if (!scopeIds.has(scopeId)) fail(`${label} names an unknown scope`);
    const scopeIndex = SCOPES.findIndex((scope) => scope.id === scopeId);
    if (scopeIndex <= previousScopeIndex) {
      fail(`${label}.scope_ids must follow canonical scope order`);
    }
    previousScopeIndex = scopeIndex;
  }
  plain(gap.statement, `${label}.statement`);
  plain(gap.evidence_needed, `${label}.evidence_needed`);
}

export function prepareCognition(source, { sourceBytes } = {}) {
  rejectAggregateFields(source);
  exactKeys(
    source,
    [
      'schema_version',
      'title',
      'description',
      'reviewed_at',
      'profile',
      'lineage',
      'claim_limits',
      'dimensions',
      'scopes',
      'observations',
      'gaps',
      'sources',
    ],
    [],
    'source'
  );
  if (source.schema_version !== SOURCE_SCHEMA_VERSION) {
    fail('unsupported schema_version');
  }
  plain(source.title, 'source.title', { max: 120 });
  plain(source.description, 'source.description', { max: 420 });
  calendarDate(source.reviewed_at, 'source.reviewed_at');

  exactKeys(source.profile, ['id', 'label', 'standing'], [], 'source.profile');
  if (!sameJson(source.profile, PROFILE)) {
    fail('source.profile must keep AI civilisation as an unscored edition profile');
  }

  exactKeys(
    source.lineage,
    ['edition', 'previous_edition_digest', 'policy'],
    [],
    'source.lineage'
  );
  if (!Number.isInteger(source.lineage.edition) || source.lineage.edition < 1) {
    fail('source.lineage.edition must be a positive integer');
  }
  if (source.lineage.edition === 1) {
    if (source.lineage.previous_edition_digest !== null) {
      fail('the first edition has no predecessor');
    }
  } else if (
    typeof source.lineage.previous_edition_digest !== 'string' ||
    !DIGEST.test(source.lineage.previous_edition_digest)
  ) {
    fail('later editions must name a predecessor digest');
  }
  if (source.lineage.policy !== LINEAGE_POLICY) {
    fail('source.lineage.policy must preserve immutable append-only editions');
  }

  if (!sameJson(source.claim_limits, CLAIM_LIMITS)) {
    fail('source.claim_limits must preserve the comparison boundary');
  }

  list(source.dimensions, 'source.dimensions', {
    min: DIMENSIONS.length,
    max: DIMENSIONS.length,
  });
  source.dimensions.forEach((dimension, index) => {
    const label = `dimensions[${index}]`;
    exactKeys(dimension, ['id', 'label', 'meaning'], [], label);
    if (
      dimension.id !== DIMENSIONS[index].id ||
      dimension.label !== DIMENSIONS[index].label
    ) {
      fail(`${label} must preserve the canonical nine-dimension map`);
    }
    plain(dimension.meaning, `${label}.meaning`, { max: 300 });
  });
  const dimensionIds = new Set(source.dimensions.map((entry) => entry.id));

  list(source.scopes, 'source.scopes', {
    min: SCOPES.length,
    max: SCOPES.length,
  });
  source.scopes.forEach((scope, index) => {
    const label = `scopes[${index}]`;
    exactKeys(scope, ['id', 'label', 'meaning'], [], label);
    if (scope.id !== SCOPES[index].id || scope.label !== SCOPES[index].label) {
      fail(`${label} must preserve the canonical scope map`);
    }
    plain(scope.meaning, `${label}.meaning`, { max: 300 });
  });
  const scopeIds = new Set(source.scopes.map((entry) => entry.id));

  const sources = list(source.sources, 'source.sources', { min: 1, max: 60 });
  sources.forEach((entry, index) =>
    validateSource(entry, source.reviewed_at, index)
  );
  unique(
    sources.map((entry) => entry.id),
    'source.sources'
  );
  unique(
    sources.map((entry) => entry.url),
    'source.source_urls'
  );
  const sourcesById = new Map(sources.map((entry) => [entry.id, entry]));

  const observations = list(source.observations, 'source.observations', {
    min: 1,
    max: 500,
  });
  const observationsById = new Map();
  const lastBySeries = new Map();
  let previousReportedAt = null;
  observations.forEach((observation, index) => {
    validateObservation(observation, {
      index,
      reviewedAt: source.reviewed_at,
      dimensionIds,
      scopeIds,
      sourcesById,
      observationsById,
      lastBySeries,
      previousReportedAt,
    });
    previousReportedAt = observation.reported_at;
  });
  const usedSourceIds = new Set(
    observations.flatMap((observation) => observation.source_ids)
  );
  for (const sourceEntry of sources) {
    if (!usedSourceIds.has(sourceEntry.id)) {
      fail(`source ${sourceEntry.id} is not cited by an observation`);
    }
  }

  const gaps = list(source.gaps, 'source.gaps', {
    min: DIMENSIONS.length,
    max: DIMENSIONS.length,
  });
  gaps.forEach((gap, index) =>
    validateGap(gap, { index, dimensionIds, scopeIds })
  );
  unique(
    gaps.map((entry) => entry.id),
    'source.gaps'
  );

  const bytes = sourceText(sourceBytes);
  let parsedSource;
  try {
    parsedSource = JSON.parse(bytes);
  } catch {
    fail('sourceBytes must contain JSON');
  }
  if (!sameJson(parsedSource, source)) {
    fail('sourceBytes must be the exact bytes parsed as source');
  }
  const editionDigest = sha256(sourceBytes);

  return {
    schema_version: PUBLIC_SCHEMA_VERSION,
    title: source.title,
    description: source.description,
    reviewed_at: source.reviewed_at,
    profile: { ...source.profile },
    lineage: { ...source.lineage, edition_digest: editionDigest },
    counts: {
      dimensions: source.dimensions.length,
      scopes: source.scopes.length,
      observations: observations.length,
      gaps: gaps.length,
      sources: sources.length,
    },
    boundaries: { ...BOUNDARIES },
    claim_limits: [...source.claim_limits],
    dimensions: source.dimensions.map((dimension) => ({
      ...dimension,
      observation_ids: observations
        .filter((observation) => observation.dimension_id === dimension.id)
        .map((observation) => observation.id),
      gap_ids: gaps
        .filter((gap) => gap.dimension_id === dimension.id)
        .map((gap) => gap.id),
    })),
    scopes: source.scopes.map((scope) => ({
      ...scope,
      observation_ids: observations
        .filter((observation) => observation.scope_id === scope.id)
        .map((observation) => observation.id),
      gap_ids: gaps
        .filter((gap) => gap.scope_ids.includes(scope.id))
        .map((gap) => gap.id),
    })),
    observations: observations.map((observation) => ({
      ...observation,
      human_reference: { ...observation.human_reference },
      source_ids: [...observation.source_ids],
      lineage: { ...observation.lineage },
    })),
    gaps: gaps.map((gap) => ({ ...gap, scope_ids: [...gap.scope_ids] })),
    sources: sources.map((sourceEntry) => ({ ...sourceEntry })),
    edition_digest: editionDigest,
  };
}

export const COGNITION = Object.freeze({
  source_schema_version: SOURCE_SCHEMA_VERSION,
  public_schema_version: PUBLIC_SCHEMA_VERSION,
  profile: PROFILE,
  dimension_ids: Object.freeze(DIMENSIONS.map((entry) => entry.id)),
  scope_ids: Object.freeze(SCOPES.map((entry) => entry.id)),
  claim_limits: CLAIM_LIMITS,
  boundaries: BOUNDARIES,
  lineage_policy: LINEAGE_POLICY,
});
