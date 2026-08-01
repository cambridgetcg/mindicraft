import { createHash } from 'node:crypto';

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/u;

const EVIDENCE_STATES = new Set([
  'established',
  'supported',
  'historical-report',
  'editorial-boundary',
  'uncertain',
  'refuted',
]);
const SOURCE_KINDS = new Set([
  'official-guidance',
  'regulator-label',
  'primary-research',
  'scholarly-history',
  'reference-record',
  'cultural-institution',
]);

// This is the same reviewed public-authority allowlist used by the medicine
// lineage source. Subdomains are accepted only beneath one of these roots.
const AUTHORITY_DOMAINS = [
  'fda.gov',
  'nih.gov',
  'cancer.gov',
  'ncbi.nlm.nih.gov',
  'who.int',
  'ema.europa.eu',
  'nobelprize.org',
  'nature.com',
  'acs.org',
  'jst.go.jp',
  'loc.gov',
  'unesco.org',
  'britishmuseum.org',
  'metmuseum.org',
  'wellcome.org',
  'wellcomecollection.org',
  'royalsociety.org',
  'royalsocietypublishing.org',
  'oup.com',
  'ox.ac.uk',
  'cambridge.org',
  'cam.ac.uk',
  'uspreventiveservicestaskforce.org',
  'museum.upenn.edu',
  'ucl.ac.uk',
  'uchicago.edu',
  'niimh.nic.in',
  'ualberta.ca',
  'stanford.edu',
  'sciencehistory.org',
  'fnha.ca',
  'tepapa.govt.nz',
  'wipo.int',
  'hmml.org',
  'inah.gob.mx',
  'florentinecodex.getty.edu',
  'getty.edu',
];

const FORBIDDEN_KEYS = new Set([
  'action',
  'amount',
  'body',
  'command',
  'dose',
  'dosage',
  'equipment',
  'extraction',
  'html',
  'ingredients',
  'instructions',
  'markdown',
  'materials',
  'method',
  'next_actions',
  'preparation',
  'procedure',
  'prompt',
  'recipe',
  'recipes',
  'steps',
]);
const DOSE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:micrograms?|milligrams?|grams?|kilograms?|mcg|[µμ]g|mg|kg|ml|mL|lit(?:re|er)s?|IU|international units?|units?|teaspoons?|tablespoons?)\b/u;
const RATIO_PATTERN = /\b\d+(?:[.,]\d+)?\s*:\s*\d+(?:[.,]\d+)?\b/u;
const FREQUENCY_PATTERN = /\b(?:once|twice|three times|four times|every \d+ hours?)\s+(?:a|per)\s+day\b/iu;
const INSTRUCTION_PATTERN = /(?:^|[.!?]\s+)(?:do not |don't )?(?:take|drink|eat|ingest|consume|swallow|inject|apply|rub|administer|use|follow|perform|practice|try|reproduce|replace|boil|brew|steep|mix|grind|crush|heat|filter|strain|extract|isolate|prepare|combine|measure|forage|substitute|self-treat)\b/iu;
const DIRECTIVE_PATTERN = /(?:\b(?:you|the reader|readers?|a patient|patients?|people|someone|anyone)\s+(?:should|must|can|may|ought to|(?:is|are) (?:encouraged|advised) to)\s+(?:take|drink|eat|ingest|consume|swallow|inject|apply|rub|administer|use|follow|perform|practice|try|reproduce|replace|boil|brew|steep|mix|grind|crush|heat|filter|strain|extract|isolate|prepare|combine|measure|forage|substitute|self-treat)\b|(?:^|[.!?]\s+)to\s+(?:make|prepare|extract|isolate|brew)\b[^.!?]{0,120},\s*(?:do not |don't )?(?:take|drink|eat|ingest|consume|swallow|inject|apply|rub|administer|use|follow|perform|practice|try|reproduce|replace|boil|brew|steep|mix|grind|crush|heat|filter|strain|extract|isolate|prepare|combine|measure|forage|substitute|self-treat)\b)/iu;
const WORD_DOSE_PATTERN = /(?:\b(?:dose|dosage)\s+(?:is|of)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:tablets?|capsules?|drops?|teaspoons?|tablespoons?|doses?|units?)\b)/iu;
const PERSONAL_DIAGNOSIS_PATTERN = /(?:\b(?:you|the reader)\s+(?:have|may have|probably have|must have|are likely to have|suffer from)\b|\byour\b[^.!?]{0,80}\b(?:means|shows|proves|indicates|confirms)\b)/iu;
const OVERSTATED_EFFICACY_PATTERN = /(?:\bcures\b|\b(?:can|will|does|proven to)\s+cure\b|\b(?:safely|effectively|reliably|successfully)\s+(?:treats?|heals?|cures?)\b|\b(?:treats?|heals?)\b[^.!?]{0,80}\b(?:safely|effectively|reliably|successfully)\b|\b(?:is|are|was|were)\s+(?:(?:proven|highly|clinically)\s+)?effective\s+(?:for|against|in treating)\b|\b(?:material|formula|elixir|cinnabar|mercury|herb|remedy)\b[^.!?]{0,50}\btreats?\b|\b(?:eradicates?|eliminates?)\b[^.!?]{0,50}\b(?:disease|infection|cancer|malaria|diabetes)\b)/iu;
const BLANKET_ORIGIN_VERDICT_PATTERN = /(?:\b(?:nature(?:'s)?|natural|herbal|herbs?|plants?)(?:\s+(?:form|version|product|remedy|medicine|medicines|option))?\s+(?:is|are)\s+(?:(?:always|inherently)\s+)?(?:the\s+)?(?:best|better|safer|safe|superior)\b|\b(?:synthetics?|synthetic\s+(?:drugs?|medicines?|compounds?))\s+(?:is|are)\s+(?:(?:always|inherently)\s+)?(?:bad|worse|dangerous|toxic|harmful|inferior)\b|\b(?:plant|natural|herbal) medicines?\b[^.!?]{0,40}\b(?:always|consistently|inherently)\s+(?:outperform|surpass|beat)\b[^.!?]{0,60}\bsynthetic\b)/iu;
const SUBSTITUTION_CUE_PATTERN = /(?:\breplaces?\b|\bsubstitutes?\s+for\b|\bstands? (?:in for|in place of)\b|\b(?:is|are|serves? as|becomes?)\s+(?:a |an )?(?:(?:safe|effective|equivalent|clinical|natural)\s+)*(?:replacement|substitute|equivalent)\b)/giu;
const SUBSTITUTION_NEGATION_PATTERN = /\b(?:no|not|never|neither|cannot|can't|does not|doesn't|do not|don't|did not|didn't|will not|won't|should not|shouldn't|must not|mustn't|without)\b[^.!?;:]{0,100}$/iu;
const HARM_CUE_PATTERN = /\b(?:poison(?:ing|ous)?|toxic(?:ity)?|unsafe|harm(?:ful)?|hazard(?:ous)?|dangerous|adverse)\b/giu;
const HARM_NEGATION_PATTERN = /\b(?:no|not|never|without|neither|cannot|can't|does not|doesn't|do not|don't|free from|harmless)\b[^.!?;:]{0,80}$/iu;
const HARM_POST_NEGATION_PATTERN = /^(?:[^.!?;:]{0,80}\b(?:has|have|had|is|are|was|were|did|does|do)\s+(?:never|not)\b|[^.!?;:]{0,80}\b(?:is|was|remains?)\s+(?:absent|unproven|undemonstrated)\b)/iu;
const NON_OPERATIONAL_PATTERN = /(?:\bno\b[^.!?]{0,100}\boperation\b[^.!?]{0,60}\bis (?:a |an )?(?:medical )?instruction\b|\b(?:provides?|gives?|includes?|offers?) no\b[^.!?]{0,180}\b(?:operation|path|direction|instruction|recipe|practice)\b|\bdo not\s+(?:inherit|reproduce|follow|try|perform|use)\b|\bleave\b(?![^.!?]{0,40}\b(?:no|none|nothing)\b)[^.!?]{0,180}\bin history\b)/iu;
const REQUIRED_BOUNDARY_SUMMARY =
  'This shelf is non-operational history. It preserves context and evidence boundaries while granting no clinical or material-practice authority.';
const REQUIRED_BOUNDARY_EXCLUSIONS = [
  'No diagnosis, dosing, prescribing, preparation, extraction, substitution, or personal treatment plan is included.',
  'No mineral, metal, plant, animal, fungal, venom, or other remedy recipe or laboratory procedure is included.',
];
const HIGH_RISK_ALCHEMY_IDS = new Set([
  'greek-pharmacy-and-graeco-egyptian-alchemy',
  'south-asian-rasashastra',
  'daoist-waidan-and-neidan',
  'islamicate-alchemy-and-pharmacy',
  'european-apothecary-and-paracelsian-medicine',
]);
const TOXIC_MATERIAL_IDS = new Set([
  'south-asian-rasashastra',
  'daoist-waidan-and-neidan',
  'european-apothecary-and-paracelsian-medicine',
]);
const LIVING_AUTHORITY_RECORDS = new Map([
  ['first-nations-health-authority-bc-overview', 'fnha.ca'],
  ['rongoa-maori-aotearoa', 'tepapa.govt.nz'],
]);

const sha256 = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fail(message) {
  throw new Error(`healing-arts: ${message}`);
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, required, label) {
  object(value, label);
  const allowed = new Set(required);
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
  if (/\r|\n|[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff<>]/u.test(value)) {
    fail(`${label} must be plain single-line text without markup`);
  }
  return value;
}

function slug(value, label) {
  plain(value, label, { max: 80 });
  if (!SAFE_ID.test(value)) fail(`${label} must be a stable plain slug`);
  return value;
}

function list(value, label, { min = 1, max = 12 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain ${min}-${max} items`);
  }
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) {
    fail(`${label} contains duplicates`);
  }
}

function calendarDate(value, label) {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value)) {
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

function hasAffirmedHarm(value) {
  HARM_CUE_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(HARM_CUE_PATTERN)) {
    const clauseStart = Math.max(
      value.lastIndexOf('.', match.index - 1),
      value.lastIndexOf('!', match.index - 1),
      value.lastIndexOf('?', match.index - 1),
      value.lastIndexOf(';', match.index - 1),
      value.lastIndexOf(':', match.index - 1)
    );
    const prefix = value.slice(clauseStart + 1, match.index);
    const suffix = value.slice(match.index + match[0].length);
    if (
      !HARM_NEGATION_PATTERN.test(prefix) &&
      !HARM_POST_NEGATION_PATTERN.test(suffix)
    ) {
      return true;
    }
  }
  return false;
}

function hasPositiveSubstitution(value) {
  SUBSTITUTION_CUE_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(SUBSTITUTION_CUE_PATTERN)) {
    const clauseStart = Math.max(
      value.lastIndexOf('.', match.index - 1),
      value.lastIndexOf('!', match.index - 1),
      value.lastIndexOf('?', match.index - 1),
      value.lastIndexOf(';', match.index - 1),
      value.lastIndexOf(':', match.index - 1)
    );
    if (!SUBSTITUTION_NEGATION_PATTERN.test(value.slice(clauseStart + 1, match.index))) {
      return true;
    }
  }
  return false;
}

function rejectUnsafeShape(value, label = 'source') {
  if (typeof value === 'string') {
    const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (DOSE_PATTERN.test(normalized)) fail(`${label} contains an explicit dose`);
    if (RATIO_PATTERN.test(normalized)) fail(`${label} contains a preparation ratio`);
    if (WORD_DOSE_PATTERN.test(normalized)) fail(`${label} contains an explicit dose`);
    if (FREQUENCY_PATTERN.test(normalized)) {
      fail(`${label} contains a dosing frequency`);
    }
    if (
      INSTRUCTION_PATTERN.test(normalized) ||
      DIRECTIVE_PATTERN.test(normalized)
    ) {
      fail(`${label} contains an operational instruction`);
    }
    if (PERSONAL_DIAGNOSIS_PATTERN.test(normalized)) {
      fail(`${label} resembles a personal diagnosis`);
    }
    if (OVERSTATED_EFFICACY_PATTERN.test(normalized)) {
      fail(`${label} makes an unsupported cure or efficacy claim`);
    }
    if (BLANKET_ORIGIN_VERDICT_PATTERN.test(normalized)) {
      fail(`${label} makes a blanket natural or synthetic superiority claim`);
    }
    if (hasPositiveSubstitution(normalized)) {
      fail(`${label} makes a positive clinical substitution claim`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUnsafeShape(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail(`${label} uses forbidden field ${key}`);
    rejectUnsafeShape(child, `${label}.${key}`);
  }
}

function evidenceState(value, label) {
  if (!EVIDENCE_STATES.has(value)) {
    fail(`${label} is not a recognised evidence state`);
  }
  return value;
}

function allowedAuthorityHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, '');
  return AUTHORITY_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

function hostMatches(hostname, domain) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, '');
  return normalized === domain || normalized.endsWith(`.${domain}`);
}

function cleanUrl(value, label, { authority = false } = {}) {
  plain(value, label, { max: 600 });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== 'https:') fail(`${label} must use HTTPS`);
  if (parsed.username || parsed.password || parsed.port) {
    fail(`${label} must be a clean public URL`);
  }
  if (authority && !allowedAuthorityHost(parsed.hostname)) {
    fail(`${label} must use a reviewed authoritative domain`);
  }
  return parsed;
}

function validateSource(source, index, reviewedAt) {
  const label = `sources[${index}]`;
  exactKeys(
    source,
    ['id', 'title', 'publisher', 'url', 'kind', 'observed_at'],
    label
  );
  slug(source.id, `${label}.id`);
  plain(source.title, `${label}.title`, { max: 220 });
  plain(source.publisher, `${label}.publisher`, { max: 140 });
  if (!SOURCE_KINDS.has(source.kind)) {
    fail(`${label}.kind is not recognised`);
  }
  calendarDate(source.observed_at, `${label}.observed_at`);
  if (source.observed_at > reviewedAt) {
    fail(`${label}.observed_at must not be after source.reviewed_at`);
  }
  cleanUrl(source.url, `${label}.url`, { authority: true });
}

function sourceIds(value, label, sourceSet, usedSourceIds) {
  list(value, label, { min: 1, max: 8 });
  value.forEach((sourceId, index) => {
    slug(sourceId, `${label}[${index}]`);
    if (!sourceSet.has(sourceId)) {
      fail(`${label} names unknown source ${sourceId}`);
    }
    usedSourceIds.add(sourceId);
  });
  unique(value, label);
  return value;
}

function claim(
  value,
  label,
  sourceSet,
  usedSourceIds,
  { editorialBoundary = false } = {}
) {
  exactKeys(value, ['text', 'evidence_state', 'source_ids'], label);
  plain(value.text, `${label}.text`, { max: 900 });
  evidenceState(value.evidence_state, `${label}.evidence_state`);
  if (
    (value.evidence_state === 'editorial-boundary') !== editorialBoundary
  ) {
    fail(
      `${label}.evidence_state must ${
        editorialBoundary ? 'be' : 'not be'
      } editorial-boundary`
    );
  }
  sourceIds(value.source_ids, `${label}.source_ids`, sourceSet, usedSourceIds);
  return value;
}

function sourcedText(value, label, sourceSet, usedSourceIds, { max = 700 } = {}) {
  exactKeys(value, ['text', 'source_ids'], label);
  plain(value.text, `${label}.text`, { max });
  sourceIds(value.source_ids, `${label}.source_ids`, sourceSet, usedSourceIds);
  return value;
}

function claims(
  value,
  label,
  sourceSet,
  usedSourceIds,
  { min = 1, max = 6 } = {}
) {
  list(value, label, { min, max });
  value.forEach((entry, index) =>
    claim(entry, `${label}[${index}]`, sourceSet, usedSourceIds)
  );
  return value;
}

function traditionSourceIds(tradition) {
  const ids = new Set();
  const collect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'source_ids') child.forEach((id) => ids.add(id));
      else collect(child);
    }
  };
  collect(tradition);
  return ids;
}

function validateTradition(
  tradition,
  index,
  { sourceReviewedAt, sourceSet, usedSourceIds }
) {
  const label = `traditions[${index}]`;
  exactKeys(
    tradition,
    [
      'id',
      'name',
      'place_period',
      'scope_note',
      'healing_aims',
      'durable_contributions',
      'limits_and_harms',
      'modern_boundary',
      'reviewed_at',
    ],
    label
  );
  slug(tradition.id, `${label}.id`);
  plain(tradition.name, `${label}.name`, { max: 140 });
  sourcedText(
    tradition.place_period,
    `${label}.place_period`,
    sourceSet,
    usedSourceIds,
    { max: 220 }
  );
  sourcedText(
    tradition.scope_note,
    `${label}.scope_note`,
    sourceSet,
    usedSourceIds,
    { max: 600 }
  );
  calendarDate(tradition.reviewed_at, `${label}.reviewed_at`);
  if (tradition.reviewed_at > sourceReviewedAt) {
    fail(`${label}.reviewed_at must not be after source.reviewed_at`);
  }

  claims(
    tradition.healing_aims,
    `${label}.healing_aims`,
    sourceSet,
    usedSourceIds,
    { max: 5 }
  );
  claims(
    tradition.durable_contributions,
    `${label}.durable_contributions`,
    sourceSet,
    usedSourceIds
  );
  claims(
    tradition.limits_and_harms,
    `${label}.limits_and_harms`,
    sourceSet,
    usedSourceIds
  );
  claim(
    tradition.modern_boundary,
    `${label}.modern_boundary`,
    sourceSet,
    usedSourceIds,
    { editorialBoundary: true }
  );

  if (TOXIC_MATERIAL_IDS.has(tradition.id)) {
    const knownHarm = tradition.limits_and_harms.some(
      (entry) =>
        entry.evidence_state === 'established' &&
        hasAffirmedHarm(entry.text)
    );
    if (!knownHarm) {
      fail(`${label} must keep an established known-harm claim`);
    }
  }
  if (
    HIGH_RISK_ALCHEMY_IDS.has(tradition.id) &&
    !NON_OPERATIONAL_PATTERN.test(tradition.modern_boundary.text)
  ) {
      fail(`${label}.modern_boundary must keep toxic-material history non-operational`);
  }
}

function requireExplicitBoundary(boundary) {
  if (
    boundary.summary !== REQUIRED_BOUNDARY_SUMMARY ||
    boundary.not_included.length !== REQUIRED_BOUNDARY_EXCLUSIONS.length ||
    boundary.not_included.some(
      (entry, index) => entry !== REQUIRED_BOUNDARY_EXCLUSIONS[index]
    )
  ) {
    fail('source.boundary must keep the canonical non-operational safety text');
  }
  const text = [
    boundary.summary,
    ...boundary.not_included,
    boundary.living_knowledge,
  ]
    .join(' ')
    .normalize('NFKC');
  const negation = '(?:no|not|never|without|does not|do not|non-operational)';
  const requirements = [
    ['diagnosis', 'diagnos(?:is|e|tic)'],
    ['dosing', 'dos(?:e|es|ing)'],
    ['prescribing', 'prescrib(?:e|es|ing)|prescription'],
    ['preparation', 'prepar(?:e|es|ing|ation)'],
    ['extraction', 'extract(?:s|ed|ing|ion)?'],
    ['substitution', 'substitut(?:e|es|ing|ion)'],
    ['recipes', 'recipes?'],
  ];
  for (const [name, target] of requirements) {
    const before = new RegExp(
      `\\b${negation}\\b[^.!?]{0,180}\\b(?:${target})\\b`,
      'iu'
    );
    const after = new RegExp(
      `\\b(?:${target})\\b[^.!?]{0,50}\\b${negation}\\b`,
      'iu'
    );
    if (!before.test(text) && !after.test(text)) {
      fail(`source.boundary must explicitly rule out ${name}`);
    }
  }
  if (
    !/\bliving Indigenous knowledge\b/iu.test(boundary.living_knowledge) ||
    !/\bauthority\b/iu.test(boundary.living_knowledge) ||
    !/\bright(?:s)?\b/iu.test(boundary.living_knowledge) ||
    !/\b(?:Nations?|communities|knowledge holders?)\b/iu.test(
      boundary.living_knowledge
    ) ||
    !/\b(?:not|no) permission\b/iu.test(boundary.living_knowledge)
  ) {
    fail('source.boundary must preserve living Indigenous authority and rights');
  }
  if (!boundary.source_ids.includes('wipo-traditional-knowledge')) {
    fail('source.boundary must cite the WIPO traditional-knowledge rights source');
  }
}

function requireIndigenousAuthority(traditions, sourcesById) {
  for (const [recordId, authorityDomain] of LIVING_AUTHORITY_RECORDS) {
    const tradition = traditions.find((entry) => entry.id === recordId);
    if (!tradition) {
      fail(`source.traditions must include the bounded living record ${recordId}`);
    }
    const sourceHosts = [...traditionSourceIds(tradition)].map(
      (id) => new URL(sourcesById[id].url).hostname
    );
    if (!sourceHosts.some((hostname) => hostMatches(hostname, authorityDomain))) {
      fail(`${recordId} must cite its named community or cultural authority`);
    }
    if (!sourceHosts.some((hostname) => hostMatches(hostname, 'wipo.int'))) {
      fail(`${recordId} must cite the WIPO rights source`);
    }
    if (
      !/\b(?:authority|rights?|permission|stewards?|knowledge holders?)\b/iu.test(
        tradition.modern_boundary.text
      )
    ) {
      fail(`${recordId} must preserve named knowledge authority`);
    }
  }
}

export function prepareHealingArts(source, { sourceBytes } = {}) {
  if (!(typeof sourceBytes === 'string' || sourceBytes instanceof Uint8Array)) {
    fail('sourceBytes must be a string or byte array');
  }

  rejectUnsafeShape(source);
  exactKeys(
    source,
    [
      'schema_version',
      'title',
      'description',
      'language',
      'reviewed_at',
      'content_is',
      'selection_basis',
      'boundary',
      'authority',
      'rights',
      'correction',
      'sources',
      'traditions',
    ],
    'source'
  );
  if (source.schema_version !== 'mindicraft.healing-arts-source/1') {
    fail('unsupported schema_version');
  }
  plain(source.title, 'source.title', { max: 140 });
  plain(source.description, 'source.description', { max: 500 });
  if (source.language !== 'en') fail('source.language must be en');
  calendarDate(source.reviewed_at, 'source.reviewed_at');
  plain(source.content_is, 'source.content_is', { max: 400 });
  plain(source.selection_basis, 'source.selection_basis', { max: 600 });

  const sources = list(source.sources, 'source.sources', { min: 8, max: 60 });
  sources.forEach((entry, index) =>
    validateSource(entry, index, source.reviewed_at)
  );
  const sourceIdList = sources.map((entry) => entry.id);
  unique(sourceIdList, 'source.sources');
  const sourceSet = new Set(sourceIdList);
  const sourcesById = Object.fromEntries(
    sources.map((entry) => [entry.id, entry])
  );
  const usedSourceIds = new Set();

  exactKeys(
    source.boundary,
    ['summary', 'not_included', 'living_knowledge', 'source_ids'],
    'source.boundary'
  );
  plain(source.boundary.summary, 'source.boundary.summary', { max: 500 });
  list(source.boundary.not_included, 'source.boundary.not_included', {
    min: 2,
    max: 6,
  }).forEach((entry, index) =>
    plain(entry, `source.boundary.not_included[${index}]`, { max: 500 })
  );
  plain(source.boundary.living_knowledge, 'source.boundary.living_knowledge', {
    max: 700,
  });
  sourceIds(
    source.boundary.source_ids,
    'source.boundary.source_ids',
    sourceSet,
    usedSourceIds
  );
  requireExplicitBoundary(source.boundary);

  exactKeys(
    source.authority,
    [
      'use',
      'actions',
      'diagnosis',
      'prescriptions',
      'substitutions',
      'writes',
      'grants',
    ],
    'source.authority'
  );
  plain(source.authority.use, 'source.authority.use', { max: 120 });
  if (
    !/\bread-only\b/iu.test(source.authority.use) ||
    !/\bnon-operational\b/iu.test(source.authority.use)
  ) {
    fail('source.authority.use must be read-only and non-operational');
  }
  for (const field of [
    'actions',
    'diagnosis',
    'prescriptions',
    'substitutions',
    'writes',
  ]) {
    if (source.authority[field] !== 'none') {
      fail(`source.authority.${field} must be none`);
    }
  }
  if (
    !Array.isArray(source.authority.grants) ||
    source.authority.grants.length !== 0
  ) {
    fail('source.authority.grants must be empty');
  }

  exactKeys(
    source.rights,
    ['summaries', 'sources', 'living_knowledge'],
    'source.rights'
  );
  plain(source.rights.summaries, 'source.rights.summaries', { max: 240 });
  plain(source.rights.sources, 'source.rights.sources', { max: 320 });
  plain(source.rights.living_knowledge, 'source.rights.living_knowledge', {
    max: 320,
  });
  if (
    !/\bMIT\b/u.test(source.rights.summaries) ||
    !/\bonly\b/iu.test(source.rights.summaries) ||
    !/\bgrants no rights\b/iu.test(source.rights.summaries) ||
    !/\bunderlying\b/iu.test(source.rights.summaries)
  ) {
    fail('source.rights must limit MIT to Mindicraft wording and code');
  }
  if (
    !/\b(?:Indigenous|Nations?|communities|knowledge holders?)\b/iu.test(
      source.rights.living_knowledge
    ) ||
    !/\bauthority\b/iu.test(source.rights.living_knowledge)
  ) {
    fail('source.rights must preserve living knowledge authority');
  }

  const correction = cleanUrl(source.correction, 'source.correction');
  if (
    correction.hostname !== 'github.com' ||
    !correction.pathname.startsWith('/cambridgetcg/mindicraft/issues/')
  ) {
    fail('source.correction must point to the Mindicraft issue tracker');
  }

  const traditions = list(source.traditions, 'source.traditions', {
    min: 8,
    max: 16,
  });
  traditions.forEach((tradition, index) =>
    validateTradition(tradition, index, {
      sourceReviewedAt: source.reviewed_at,
      sourceSet,
      usedSourceIds,
    })
  );
  unique(
    traditions.map((tradition) => tradition.id),
    'source.traditions'
  );
  for (const protectedId of HIGH_RISK_ALCHEMY_IDS) {
    if (!traditions.some((tradition) => tradition.id === protectedId)) {
      fail(`source.traditions must include protected high-risk record ${protectedId}`);
    }
  }
  requireIndigenousAuthority(traditions, sourcesById);

  for (const sourceId of sourceIdList) {
    if (!usedSourceIds.has(sourceId)) {
      fail(`source ${sourceId} is not cited`);
    }
  }

  return {
    ...source,
    source,
    sourceDigest: sha256(sourceBytes),
    counts: {
      sources: sources.length,
      traditions: traditions.length,
    },
    sourcesById,
    traditionsById: Object.fromEntries(
      traditions.map((entry) => [entry.id, entry])
    ),
  };
}
