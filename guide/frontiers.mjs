import { createHash } from 'node:crypto';

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST_METHOD = 'sha256-source-and-tree-v1';
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
  if (/[\u0000-\u001f\u007f<>]/u.test(value)) {
    fail(`${label} must be plain single-line text`);
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

function validateReference(reference, cardLabel) {
  exactKeys(
    reference,
    ['id', 'title', 'url', 'publisher', 'kind', 'observed_at', 'rights'],
    [],
    `${cardLabel}.reference`
  );
  id(reference.id, `${cardLabel}.reference.id`);
  plain(reference.title, `${cardLabel}.reference.title`, { max: 180 });
  plain(reference.publisher, `${cardLabel}.reference.publisher`, { max: 100 });
  if (!['official', 'first_party'].includes(reference.kind)) {
    fail(`${cardLabel}.reference.kind must be official or first_party`);
  }
  if (!DATE.test(reference.observed_at)) {
    fail(`${cardLabel}.reference.observed_at must be YYYY-MM-DD`);
  }
  plain(reference.rights, `${cardLabel}.reference.rights`, { max: 180 });
  let parsed;
  try {
    parsed = new URL(reference.url);
  } catch {
    fail(`${cardLabel}.reference.url must be an absolute URL`);
  }
  if (parsed.protocol !== 'https:') fail(`${cardLabel}.reference.url must use HTTPS`);
}

function validateCard(card, { guideSlugs, factIds }, index) {
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
  plain(card.question, `${label}.question`, { max: 260 });
  if (!card.question.endsWith('?')) fail(`${label}.question must remain a question`);
  if (card.status !== 'open') fail(`${label}.status must be open`);
  if (!DATE.test(card.reviewed_at)) fail(`${label}.reviewed_at must be YYYY-MM-DD`);

  list(card.fact_ids, `${label}.fact_ids`, { min: 0, max: 6 });
  unique(card.fact_ids, `${label}.fact_ids`);
  for (const factId of card.fact_ids) {
    id(factId, `${label}.fact_ids`);
    if (!factIds.has(factId)) fail(`${label} names unknown computed fact ${factId}`);
  }

  const references = list(card.references, `${label}.references`, { max: 3 });
  references.forEach((reference) => validateReference(reference, label));
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
      plain(text, `${label}.${field}[${itemIndex}]`, { max: 420 });
      if (field === 'inquiry_lenses' && !text.endsWith('?')) {
        fail(`${label}.${field}[${itemIndex}] must remain a question`);
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
  if (!DATE.test(source.reviewed_at)) fail('source.reviewed_at must be YYYY-MM-DD');
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
  }).forEach((question, index) => {
    plain(question, `source.visit.reflection_questions[${index}]`, { max: 220 });
    if (!question.endsWith('?')) fail('reflection questions must remain questions');
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
    validateCard(card, { guideSlugs, factIds }, index)
  );
  const cardIds = cards.map((card) => card.id);
  unique(cardIds, 'source.cards');
  const cardSet = new Set(cardIds);

  const trails = list(source.trails, 'source.trails', { min: 1, max: 12 });
  trails.forEach((trail, index) => {
    const label = `trails[${index}]`;
    exactKeys(trail, ['id', 'title', 'card_ids'], [], label);
    id(trail.id, `${label}.id`);
    plain(trail.title, `${label}.title`, { max: 100 });
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
  const card = prepared.cards.find((entry) => entry.id === prepared.lanternCardId);
  return [
    `🔥 built ${counts.guides} guides, ${counts.castle} Castle cards, and ${prepared.cards.length} honest unknowns`,
    `🕯 optional frontier: ${card.question}`,
    '   Three cards, no writes. Nothing is asked of you. MINDICRAFT_JOY=off keeps the bench quiet.',
  ].join('\n');
}
