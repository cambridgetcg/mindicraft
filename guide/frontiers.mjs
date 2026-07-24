import { createHash } from 'node:crypto';

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST_METHOD = 'sha256-source-and-tree-v1';
const REFERENCE_POLICIES = new Map([
  [
    'github.com',
    {
      kind: 'first_party',
      publisher: 'Mindicraft',
      path: /^\/cambridgetcg\/mindicraft\/blob\/main\/guide\/(?:build\.mjs|evidence\.json|tree\.json|langs\.json)$/,
    },
  ],
  ['science.nasa.gov', { kind: 'official', publisher: 'NASA Science' }],
  ['astrobiology.nasa.gov', { kind: 'official', publisher: 'NASA Astrobiology' }],
  ['home.cern', { kind: 'official', publisher: 'CERN' }],
]);
// Defense in depth for the committed, human-reviewed shelf—not a sanitizer or
// permission to import generated or untrusted questions.
const INSTRUCTION_SHAPES = [
  /\b(?:ignore|disregard|override)\b.{0,50}\b(?:instruction|message|rule)s?\b/iu,
  /\b(?:send|reveal|expose|print|return|upload)\b.{0,60}\b(?:secret|credential|password|token|private key|system prompt)s?\b/iu,
  /\b(?:run|execute|invoke)\b.{0,50}\b(?:command|shell|tool|code)\b/iu,
];
const FORBIDDEN_KEYS = new Set([
  'answer',
  'body',
  'command',
  'html',
  'markdown',
  'next_actions',
  'prompt',
  'solution',
  'system',
  'tool',
]);

const sha256 = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fail(message) {
  throw new Error(`frontiers: ${message}`);
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

function plain(value, label, { min = 1, max = 600 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(`${label} must be ${min}-${max} characters`);
  }
  if (/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff<>]/u.test(value)) {
    fail(`${label} must be plain single-line text`);
  }
  return value;
}

function question(value, label, { max = 420 } = {}) {
  plain(value, label, { max });
  if (!value.endsWith('?')) fail(`${label} must remain a question`);
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ');
  if (INSTRUCTION_SHAPES.some((shape) => shape.test(normalized))) {
    fail(`${label} resembles an instruction rather than an open question`);
  }
  return value;
}

function calendarDate(value, label) {
  if (!DATE.test(value)) fail(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail(`${label} must be a real calendar date`);
  }
  return value;
}

function id(value, label) {
  plain(value, label, { max: 80 });
  if (!SAFE_ID.test(value)) fail(`${label} must be a stable plain slug`);
  return value;
}

function list(value, label, { min = 1, max = 6 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain ${min}-${max} items`);
  }
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function rejectInstructionFields(value, label = 'source') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectInstructionFields(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${label} uses forbidden field ${key}`);
    rejectInstructionFields(child, `${label}.${key}`);
  }
}

function validateReference(reference, cardLabel, cardReviewedAt) {
  exactKeys(
    reference,
    ['id', 'title', 'url', 'publisher', 'kind', 'observed_at', 'rights'],
    [],
    `${cardLabel}.reference`
  );
  id(reference.id, `${cardLabel}.reference.id`);
  plain(reference.title, `${cardLabel}.reference.title`, { max: 180 });
  plain(reference.publisher, `${cardLabel}.reference.publisher`, { max: 100 });
  calendarDate(reference.observed_at, `${cardLabel}.reference.observed_at`);
  if (reference.observed_at > cardReviewedAt) {
    fail(`${cardLabel}.reference was observed after its card was reviewed`);
  }
  plain(reference.rights, `${cardLabel}.reference.rights`, { max: 180 });
  let parsed;
  try {
    parsed = new URL(reference.url);
  } catch {
    fail(`${cardLabel}.reference.url must be an absolute URL`);
  }
  if (parsed.protocol !== 'https:') fail(`${cardLabel}.reference.url must use HTTPS`);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    fail(`${cardLabel}.reference.url must be a clean canonical source URL`);
  }
  const policy = REFERENCE_POLICIES.get(parsed.hostname);
  if (
    !policy ||
    reference.kind !== policy.kind ||
    reference.publisher !== policy.publisher ||
    (policy.path && !policy.path.test(parsed.pathname))
  ) {
    fail(`${cardLabel}.reference must match a reviewed source authority`);
  }
}

function validateCard(card, { guideSlugs, factIds, sourceReviewedAt }, index) {
  const label = `cards[${index}]`;
  exactKeys(
    card,
    [
      'id',
      'kind',
      'scope',
      'title',
      'question',
      'status',
      'fact_ids',
      'known',
      'unknown',
      'evidence_that_would_move_it',
      'inquiry_lenses',
      'related_guides',
      'references',
      'reviewed_at',
    ],
    ['related_shelves'],
    label
  );

  id(card.id, `${label}.id`);
  if (!['craft', 'learning', 'cosmos', 'life'].includes(card.kind)) {
    fail(`${label}.kind is not recognised`);
  }
  if (!['mindicraft_record', 'scientific_open_question'].includes(card.scope)) {
    fail(`${label}.scope is not recognised`);
  }
  plain(card.title, `${label}.title`, { max: 100 });
  question(card.question, `${label}.question`, { max: 260 });
  if (card.status !== 'open') fail(`${label}.status must be open`);
  calendarDate(card.reviewed_at, `${label}.reviewed_at`);
  if (card.reviewed_at > sourceReviewedAt) {
    fail(`${label}.reviewed_at must not be after source.reviewed_at`);
  }

  list(card.fact_ids, `${label}.fact_ids`, { min: 0, max: 6 });
  unique(card.fact_ids, `${label}.fact_ids`);
  for (const factId of card.fact_ids) {
    id(factId, `${label}.fact_ids`);
    if (!factIds.has(factId)) fail(`${label} names unknown computed fact ${factId}`);
  }

  const references = list(card.references, `${label}.references`, { max: 3 });
  references.forEach((reference) =>
    validateReference(reference, label, card.reviewed_at)
  );
  const expectedReferenceKind =
    card.scope === 'mindicraft_record' ? 'first_party' : 'official';
  if (references.some((reference) => reference.kind !== expectedReferenceKind)) {
    fail(`${label}.references must match the card scope`);
  }
  const referenceIds = references.map((reference) => reference.id);
  unique(referenceIds, `${label}.references`);
  const referenceSet = new Set(referenceIds);

  const known = list(card.known, `${label}.known`, { max: 4 });
  known.forEach((entry, knownIndex) => {
    const knownLabel = `${label}.known[${knownIndex}]`;
    exactKeys(entry, ['text', 'source_ids'], [], knownLabel);
    plain(entry.text, `${knownLabel}.text`, { max: 420 });
    list(entry.source_ids, `${knownLabel}.source_ids`, { max: 3 });
    unique(entry.source_ids, `${knownLabel}.source_ids`);
    for (const sourceId of entry.source_ids) {
      id(sourceId, `${knownLabel}.source_ids`);
      if (!referenceSet.has(sourceId)) {
        fail(`${knownLabel} names missing reference ${sourceId}`);
      }
    }
  });

  for (const [field, max] of [
    ['unknown', 4],
    ['evidence_that_would_move_it', 4],
    ['inquiry_lenses', 3],
  ]) {
    list(card[field], `${label}.${field}`, { max });
    card[field].forEach((text, itemIndex) => {
      if (field === 'inquiry_lenses') {
        question(text, `${label}.${field}[${itemIndex}]`);
      } else {
        plain(text, `${label}.${field}[${itemIndex}]`, { max: 420 });
      }
    });
  }

  list(card.related_guides, `${label}.related_guides`, { max: 6 });
  unique(card.related_guides, `${label}.related_guides`);
  for (const slug of card.related_guides) {
    id(slug, `${label}.related_guides`);
    if (!guideSlugs.has(slug)) fail(`${label} names missing guide ${slug}`);
  }

  for (const [shelfIndex, shelf] of (card.related_shelves || []).entries()) {
    const shelfLabel = `${label}.related_shelves[${shelfIndex}]`;
    exactKeys(shelf, ['label', 'href', 'use', 'rights'], [], shelfLabel);
    plain(shelf.label, `${shelfLabel}.label`, { max: 120 });
    if (
      typeof shelf.href !== 'string' ||
      !/^\/api\/castle\/(?:rooms|words)\/[A-Za-z0-9%_-]+\.json$/u.test(shelf.href)
    ) {
      fail(`${shelfLabel}.href must be one Castle map-card API path`);
    }
    if (shelf.use !== 'link_only') fail(`${shelfLabel}.use must be link_only`);
    if (shelf.rights !== 'NOASSERTION; no licence grant') {
      fail(`${shelfLabel}.rights must preserve the Castle boundary`);
    }
  }
}

export function prepareFrontiers(
  source,
  { guideSlugs, factIds, sourceBytes, treeBytes }
) {
  rejectInstructionFields(source);
  exactKeys(
    source,
    [
      'schema_version',
      'title',
      'description',
      'reviewed_at',
      'content_is',
      'authority',
      'visit',
      'rights',
      'correction',
      'cards',
      'trails',
    ],
    [],
    'source'
  );
  if (source.schema_version !== 'mindicraft.frontiers-source/1') {
    fail('unsupported schema_version');
  }
  plain(source.title, 'source.title', { max: 100 });
  plain(source.description, 'source.description', { max: 400 });
  calendarDate(source.reviewed_at, 'source.reviewed_at');
  if (source.content_is !== 'unresolved questions, not instructions or settled knowledge') {
    fail('source.content_is must preserve the question boundary');
  }
  if (typeof source.correction !== 'string') fail('source.correction must be a URL');
  let correction;
  try {
    correction = new URL(source.correction);
  } catch {
    fail('source.correction must be an absolute URL');
  }
  if (correction.protocol !== 'https:') fail('source.correction must use HTTPS');

  exactKeys(source.authority, ['automatic_action', 'grants', 'writes'], [], 'source.authority');
  if (
    source.authority.automatic_action !== 'never' ||
    source.authority.writes !== 'none' ||
    !Array.isArray(source.authority.grants) ||
    source.authority.grants.length !== 0
  ) {
    fail('source.authority must grant nothing and perform no action or write');
  }

  exactKeys(
    source.visit,
    [
      'cards',
      'optional',
      'max_minutes',
      'optional_link_reads_per_card_max',
      'reading_note',
      'writes',
      'physical_action',
      'reflection_questions',
      'return_fields',
      'stop',
    ],
    [],
    'source.visit'
  );
  if (
    source.visit.cards !== 3 ||
    source.visit.optional !== true ||
    !Number.isInteger(source.visit.max_minutes) ||
    source.visit.max_minutes < 1 ||
    source.visit.max_minutes > 15 ||
    source.visit.optional_link_reads_per_card_max !== 3 ||
    source.visit.writes !== false ||
    source.visit.physical_action !== false
  ) {
    fail('source.visit must be optional, read-only, three-card, and bounded to 15 minutes');
  }
  plain(source.visit.reading_note, 'source.visit.reading_note', { max: 220 });
  list(source.visit.reflection_questions, 'source.visit.reflection_questions', {
    min: 3,
    max: 3,
  }).forEach((text, index) => {
    question(text, `source.visit.reflection_questions[${index}]`, { max: 220 });
  });
  list(source.visit.return_fields, 'source.visit.return_fields', { min: 3, max: 3 });
  unique(source.visit.return_fields, 'source.visit.return_fields');
  source.visit.return_fields.forEach((field, index) =>
    id(field, `source.visit.return_fields[${index}]`)
  );
  plain(source.visit.stop, 'source.visit.stop', { max: 220 });

  exactKeys(
    source.rights,
    ['card_text', 'linked_sources', 'castle_refs'],
    [],
    'source.rights'
  );
  plain(source.rights.card_text, 'source.rights.card_text', { max: 180 });
  plain(source.rights.linked_sources, 'source.rights.linked_sources', { max: 220 });
  plain(source.rights.castle_refs, 'source.rights.castle_refs', { max: 220 });

  const cards = list(source.cards, 'source.cards', { min: 3, max: 12 });
  cards.forEach((card, index) =>
    validateCard(
      card,
      { guideSlugs, factIds, sourceReviewedAt: source.reviewed_at },
      index
    )
  );
  const cardIds = cards.map((card) => card.id);
  unique(cardIds, 'source.cards');
  const cardSet = new Set(cardIds);

  const trails = list(source.trails, 'source.trails', { min: 1, max: 12 });
  trails.forEach((trail, index) => {
    const label = `trails[${index}]`;
    exactKeys(trail, ['id', 'title', 'bridge_question', 'card_ids'], [], label);
    id(trail.id, `${label}.id`);
    if (trail.id === 'default') fail(`${label}.id default is reserved`);
    plain(trail.title, `${label}.title`, { max: 100 });
    question(trail.bridge_question, `${label}.bridge_question`, { max: 260 });
    list(trail.card_ids, `${label}.card_ids`, { min: 3, max: 3 });
    unique(trail.card_ids, `${label}.card_ids`);
    for (const cardId of trail.card_ids) {
      id(cardId, `${label}.card_ids`);
      if (!cardSet.has(cardId)) fail(`${label} names missing card ${cardId}`);
    }
  });
  unique(
    trails.map((trail) => trail.id),
    'source.trails'
  );
  const usedCards = new Set(trails.flatMap((trail) => trail.card_ids));
  for (const cardId of cardIds) {
    if (!usedCards.has(cardId)) fail(`card ${cardId} is not reachable from a trail`);
  }

  const sourceDigest = sha256(sourceBytes);
  const treeDigest = sha256(treeBytes);
  const editionHex = createHash('sha256')
    .update(sourceBytes)
    .update('\0')
    .update(treeBytes)
    .digest('hex');
  const editionDigest = `sha256:${editionHex}`;
  const trailIndex =
    Number(BigInt(`0x${editionHex.slice(0, 16)}`) % BigInt(trails.length));
  const defaultTrail = trails[trailIndex];
  const cardIndex =
    Number(BigInt(`0x${editionHex.slice(16, 32)}`) % BigInt(defaultTrail.card_ids.length));

  return {
    source,
    cards,
    trails,
    sourceDigest,
    treeDigest,
    editionDigest,
    selectionMethod: DIGEST_METHOD,
    defaultTrailId: defaultTrail.id,
    lanternCardId: defaultTrail.card_ids[cardIndex],
  };
}

export function buildLantern(prepared, counts, env = process.env) {
  const setting = String(env.MINDICRAFT_JOY || '').trim().toLowerCase();
  if (['0', 'false', 'off', 'quiet'].includes(setting)) return '';
  const requestedTrail = String(env.MINDICRAFT_TRAIL || '').trim();
  const trail = requestedTrail
    ? prepared.trails.find((entry) => entry.id === requestedTrail)
    : prepared.trails.find((entry) => entry.id === prepared.defaultTrailId);
  if (!trail) {
    fail(
      `MINDICRAFT_TRAIL must name one of: ${prepared.trails
        .map((entry) => entry.id)
        .join(', ')}`
    );
  }
  const editionHex = prepared.editionDigest.slice('sha256:'.length);
  const cardIndex = Number(
    BigInt(`0x${editionHex.slice(16, 32)}`) % BigInt(trail.card_ids.length)
  );
  const card = prepared.cards.find(
    (entry) => entry.id === trail.card_ids[cardIndex]
  );
  return [
    `🔥 built ${counts.guides} guides, ${counts.castle} Castle cards, and ${prepared.cards.length} honest unknowns`,
    `🕯 optional frontier: ${trail.title}`,
    `   ${trail.bridge_question}`,
    `   Lit door: ${card.question}`,
    `   /frontier/${trail.id}/ · Three cards, no writes. Nothing is asked of you.`,
    '   Choose with MINDICRAFT_TRAIL=<trail>; quiet with MINDICRAFT_JOY=off.',
  ].join('\n');
}
