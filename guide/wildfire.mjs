import { createHash } from 'node:crypto';

const SCHEMA_VERSION = 'mindicraft.wildfire-help/1';
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_SOURCE_BYTES = 128 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 8192;
const MAX_SOURCE_AGE_DAYS = 31;
const MAX_REVIEW_WINDOW_DAYS = 62;

const PATH_ORDER = Object.freeze([
  'leave-now',
  'safe-away',
  'smoke-health',
  'return-home',
  'rebuild',
  'help-someone',
]);

const PATH_STEP_ORDER = Object.freeze({
  'leave-now': Object.freeze([
    'obey-or-go',
    'official-route',
    'take-close-items',
    'cannot-leave',
    'tell-one-person',
  ]),
  'safe-away': Object.freeze([
    'shelter-first',
    'urgent-needs',
    'do-not-return',
    'start-one-folder',
    'official-aid-only',
  ]),
  'smoke-health': Object.freeze([
    'orders-first',
    'cleaner-air',
    'respirator-limit',
    'urgent-health',
    'higher-risk',
  ]),
  'return-home': Object.freeze([
    'clearance-gate',
    'hidden-hazards',
    'water-and-food',
    'document-first',
    'ash-safety',
  ]),
  rebuild: Object.freeze([
    'insurer-landlord',
    'one-record',
    'verify-contractors',
    'permits-and-codes',
    'human-support',
  ]),
  'help-someone': Object.freeze([
    'safety-first',
    'ask-one-thing',
    'do-not-force-story',
    'share-exact-door',
    'care-message',
  ]),
});

const REGION_ORDER = Object.freeze([
  'global',
  'united-states',
  'canada',
  'european-union',
  'united-kingdom',
  'australia',
  'new-zealand',
]);

const REGION_CALLS = Object.freeze({
  global: null,
  'united-states': 'tel:911',
  canada: 'tel:911',
  'european-union': 'tel:112',
  'united-kingdom': 'tel:999',
  australia: 'tel:000',
  'new-zealand': 'tel:111',
});

const REGION_TITLES = Object.freeze({
  global: 'Elsewhere or not sure',
  'united-states': 'United States',
  canada: 'Canada',
  'european-union': 'European Union',
  'united-kingdom': 'United Kingdom',
  australia: 'Australia',
  'new-zealand': 'New Zealand',
});

const REGION_DISPLAYS = Object.freeze({
  global: null,
  'united-states': '911',
  canada: '911 or your local emergency number',
  'european-union': '112',
  'united-kingdom': '999',
  australia: 'Triple Zero (000)',
  'new-zealand': '111',
});

const BOUNDARY = Object.freeze({
  live_status:
    'This is a static guide. It does not know where the fire is, which roads are open, whether a shelter has space, or whether return is permitted.',
  authority:
    'Current instructions from local fire, police, emergency management, public health, and evacuation authorities override this guide.',
  emergency:
    'If you are in immediate danger or cannot leave, call the emergency number for your country now and give your exact location and access needs.',
  privacy:
    'Mindicraft does not request a precise location, infer or transmit your location, or store a survivor profile. You choose a country or region yourself to see the right official numbers.',
  not_included: Object.freeze([
    'live fire, road, evacuation-zone, shelter-capacity, or return-clearance data',
    'fire prediction, route calculation, emergency dispatch, or missing-person matching',
    'medical diagnosis, insurance or aid eligibility decisions, contractor recommendations, or guaranteed outcomes',
    'accounts, precise-location collection, telemetry, donations, advertising, or public survivor posts',
  ]),
});

const CORE_TEXT = Object.freeze({
  leave_summary: 'Leave first. Do not finish the page or try to protect property.',
  leave_step:
    'If officials tell you to evacuate—or fire or smoke makes you feel unsafe—leave now. Do not stop to collect belongings or fight the fire.',
  smoke_step:
    'Smoke advice is not permission to stay near a fire. If officials tell you to evacuate, leave immediately.',
  respirator_step:
    'A well-fitting particulate respirator certified by the authority in your country—for example, a NIOSH-approved N95 or P100 in the United States—can reduce particle exposure. It does not supply oxygen, protect against gases, or replace evacuation.',
  away_return_step:
    'Do not return for belongings until local authorities reopen the area. Do not enter a fire-damaged building until the responsible authority or a qualified inspector says it can be entered.',
  return_summary:
    'Return only after authorities reopen the area, and enter a damaged building only after responsible clearance. Fire damage can hide heat, electricity, structural, water, and ash hazards.',
  return_step:
    'Return only after local authorities reopen the area. Enter a fire-damaged building only after the responsible authority or a qualified inspector says it is safe. A quiet street, map, or social post is not clearance.',
  return_water_step:
    'Follow local public-health advice before using tap or private-well water, or food exposed to fire, ash, heat, damaged packaging, or lost refrigeration. Sealed, undamaged supplies from a safe source can still be used.',
  return_ash_step:
    'Keep children, pets, older adults, and people with heart or lung conditions away from ash cleanup. Burned-structure ash may contain hazardous material; follow the local debris program before cleanup and use the protection it requires.',
});

const SOURCE_KINDS = new Set([
  'government-accessibility-guidance',
  'government-animal-guidance',
  'government-assistance-router',
  'government-crisis-support',
  'government-emergency-guidance',
  'government-emergency-number',
  'government-live-router',
  'government-recovery-guidance',
  'insurance-regulator-guidance',
  'international-public-health-guidance',
  'public-health-guidance',
  'public-health-live-router',
  'recognized-humanitarian-directory',
  'recognized-humanitarian-router',
]);

const SOURCE_AUTHORITIES = new Map([
  ['www.ready.gov', {
    publishers: ['Ready.gov, United States Department of Homeland Security'],
    kinds: ['government-emergency-guidance'],
  }],
  ['www.fema.gov', {
    publishers: ['Federal Emergency Management Agency'],
    kinds: ['government-emergency-guidance', 'government-live-router'],
  }],
  ['www.cdc.gov', {
    publishers: [
      'United States Centers for Disease Control and Prevention',
      'United States National Institute for Occupational Safety and Health',
    ],
    kinds: ['public-health-guidance'],
  }],
  ['www.epa.gov', {
    publishers: ['United States Environmental Protection Agency'],
    kinds: ['public-health-guidance', 'government-recovery-guidance'],
  }],
  ['www.usfa.fema.gov', {
    publishers: ['United States Fire Administration'],
    kinds: ['government-recovery-guidance'],
  }],
  ['content.naic.org', {
    publishers: ['National Association of Insurance Commissioners'],
    kinds: ['insurance-regulator-guidance'],
  }],
  ['www.aphis.usda.gov', {
    publishers: ['United States Department of Agriculture'],
    kinds: ['government-animal-guidance'],
  }],
  ['www.who.int', {
    publishers: ['World Health Organization'],
    kinds: ['international-public-health-guidance'],
  }],
  ['www.ifrc.org', {
    publishers: ['International Federation of Red Cross and Red Crescent Societies'],
    kinds: ['recognized-humanitarian-directory'],
  }],
  ['inciweb.wildfire.gov', {
    publishers: ['United States interagency wildland fire community'],
    kinds: ['government-live-router'],
  }],
  ['fire.airnow.gov', {
    publishers: ['AirNow, United States Environmental Protection Agency partners'],
    kinds: ['government-live-router'],
  }],
  ['www.redcross.org', {
    publishers: ['American Red Cross'],
    kinds: ['recognized-humanitarian-router'],
  }],
  ['www.usa.gov', {
    publishers: ['USAGov'],
    kinds: ['government-assistance-router'],
  }],
  ['www.disasterassistance.gov', {
    publishers: ['United States Department of Homeland Security'],
    kinds: ['government-assistance-router'],
  }],
  ['www.samhsa.gov', {
    publishers: ['United States Substance Abuse and Mental Health Services Administration'],
    kinds: ['government-crisis-support'],
  }],
  ['www.canada.ca', {
    publishers: ['Government of Canada'],
    kinds: [
      'government-accessibility-guidance',
      'government-assistance-router',
      'government-emergency-guidance',
      'government-live-router',
      'public-health-live-router',
    ],
  }],
  ['www.redcross.ca', {
    publishers: ['Canadian Red Cross'],
    kinds: ['recognized-humanitarian-router'],
  }],
  ['digital-strategy.ec.europa.eu', {
    publishers: ['European Commission'],
    kinds: ['government-emergency-number'],
  }],
  ['civil-protection-humanitarian-aid.ec.europa.eu', {
    publishers: ['European Commission Civil Protection and Humanitarian Aid Operations'],
    kinds: ['government-live-router'],
  }],
  ['airindex.eea.europa.eu', {
    publishers: ['European Environment Agency'],
    kinds: ['government-live-router'],
  }],
  ['www.gov.uk', {
    publishers: ['Government of the United Kingdom'],
    kinds: ['government-live-router'],
  }],
  ['prepare.campaign.gov.uk', {
    publishers: ['Government of the United Kingdom'],
    kinds: ['government-emergency-guidance'],
  }],
  ['www.infrastructure.gov.au', {
    publishers: ['Australian Government'],
    kinds: ['government-emergency-number'],
  }],
  ['my.gov.au', {
    publishers: ['Australian Government myGov'],
    kinds: ['government-live-router'],
  }],
  ['www.disasterassist.gov.au', {
    publishers: ['Australian Government Disaster Assist'],
    kinds: ['government-assistance-router'],
  }],
  ['www.health.gov.au', {
    publishers: ['Australian Government Department of Health, Disability and Ageing'],
    kinds: ['public-health-guidance'],
  }],
  ['getready.govt.nz', {
    publishers: ['New Zealand Civil Defence'],
    kinds: ['government-emergency-guidance'],
  }],
  ['www.civildefence.govt.nz', {
    publishers: ['New Zealand National Emergency Management Agency'],
    kinds: [
      'government-assistance-router',
      'government-live-router',
      'government-recovery-guidance',
    ],
  }],
]);

const UNSAFE_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'html',
  'innerHTML',
  'outerHTML',
  'srcdoc',
  'script',
  'style',
  'command',
  'prompt',
  'system',
  'tool',
  'latitude',
  'longitude',
  'coordinates',
  'geolocation',
  'address',
  'postcode',
  'ip_address',
  'tracking',
  'telemetry',
  'account',
  'profile',
  'dispatch',
  'route_calculation',
  'live_data',
]);

function fail(message) {
  throw new Error(`wildfire: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeTree(root, label) {
  const seen = new WeakSet();
  let nodes = 0;

  function visit(value, path, depth) {
    nodes += 1;
    if (nodes > MAX_NODES) fail(`${label} exceeds ${MAX_NODES} data nodes`);
    if (depth > MAX_DEPTH) fail(`${label} exceeds depth ${MAX_DEPTH}`);

    if (typeof value === 'string') {
      if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(value)) {
        fail(`${path} contains unsafe control text`);
      }
      if (
        /[<>]/u.test(value) ||
        /(?:javascript\s*:|vbscript\s*:|data\s*:\s*text\/html)/iu.test(value)
      ) {
        fail(`${path} contains active HTML or an active URI`);
      }
      for (let index = 0; index < value.length; index += 1) {
        const unit = value.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
          const next = value.charCodeAt(index + 1);
          if (!(next >= 0xdc00 && next <= 0xdfff)) {
            fail(`${path} contains an unpaired Unicode surrogate`);
          }
          index += 1;
        } else if (unit >= 0xdc00 && unit <= 0xdfff) {
          fail(`${path} contains an unpaired Unicode surrogate`);
        }
      }
      return;
    }
    if (value === null || typeof value === 'boolean') return;
    if (typeof value !== 'object') fail(`${path} contains unsupported data`);
    if (seen.has(value)) fail(`${path} contains a cycle`);
    seen.add(value);

    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (key === 'length') continue;
        if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key)) {
          fail(`${path} has a hidden array field`);
        }
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index >= value.length) {
          fail(`${path} has an invalid array index`);
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) fail(`${path} contains an array hole`);
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          fail(`${path}[${index}] must be ordinary data`);
        }
        visit(value[index], `${path}[${index}]`, depth + 1);
      }
      return;
    }

    if (!isPlainObject(value)) fail(`${path} must be a plain object`);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') fail(`${path} contains a symbol field`);
      if (UNSAFE_KEYS.has(key) || /^on[a-z]/iu.test(key)) {
        fail(`${path} uses unsafe field ${key}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        fail(`${path}.${key} must be ordinary enumerable data`);
      }
      visit(descriptor.value, `${path}.${key}`, depth + 1);
    }
  }

  visit(root, label, 0);
}

function object(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  return value;
}

function exactKeys(value, required, optional, label) {
  object(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`);
  }
}

function plain(value, label, { min = 1, max = 600 } = {}) {
  if (
    typeof value !== 'string' ||
    value.length < min ||
    value.length > max ||
    value.trim() !== value
  ) {
    fail(`${label} must be ${min}-${max} characters of plain text`);
  }
  return value;
}

function id(value, label) {
  plain(value, label, { max: 80 });
  if (!SAFE_ID.test(value)) fail(`${label} must be a stable plain slug`);
  return value;
}

function list(value, label, { min = 1, max = 20 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain ${min}-${max} items`);
  }
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function exactOrder(values, expected, label) {
  if (
    values.length !== expected.length ||
    values.some((value, index) => value !== expected[index])
  ) {
    fail(`${label} must remain in this order: ${expected.join(', ')}`);
  }
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

function daysBetween(earlier, later) {
  return (
    new Date(`${later}T00:00:00.000Z`).getTime() -
    new Date(`${earlier}T00:00:00.000Z`).getTime()
  ) / 86_400_000;
}

function sourceIds(values, label, sourceMap, usedSourceIds) {
  list(values, label, { min: 1, max: 6 });
  values.forEach((value, index) => id(value, `${label}[${index}]`));
  unique(values, label);
  for (const sourceId of values) {
    if (!sourceMap.has(sourceId)) fail(`${label} names missing source ${sourceId}`);
    usedSourceIds.add(sourceId);
  }
}

function cleanHttpsUrl(value, label) {
  if (
    typeof value !== 'string' ||
    value.length > 500 ||
    value.trim() !== value
  ) {
    fail(`${label} must be a bounded URL`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    fail(`${label} must be a clean HTTPS source URL`);
  }
  if (
    url.search &&
    !(url.hostname === 'www.health.gov.au' && url.search === '?language=en')
  ) {
    fail(`${label} must not contain unreviewed query parameters`);
  }
  return url;
}

function validateSource(source, index, reviewedAt, regionSet) {
  const label = `source.sources[${index}]`;
  exactKeys(
    source,
    ['id', 'title', 'publisher', 'url', 'observed_at', 'kind', 'region'],
    [],
    label
  );
  id(source.id, `${label}.id`);
  plain(source.title, `${label}.title`, { max: 160 });
  plain(source.publisher, `${label}.publisher`, { max: 140 });
  calendarDate(source.observed_at, `${label}.observed_at`);
  const age = daysBetween(source.observed_at, reviewedAt);
  if (age < 0) fail(`${label} was observed after the guide review`);
  if (age > MAX_SOURCE_AGE_DAYS) {
    fail(`${label} was not observed within ${MAX_SOURCE_AGE_DAYS} days of review`);
  }
  if (!SOURCE_KINDS.has(source.kind)) fail(`${label}.kind is not recognised`);
  id(source.region, `${label}.region`);
  if (!regionSet.has(source.region)) fail(`${label}.region is not a published region`);

  const url = cleanHttpsUrl(source.url, `${label}.url`);
  const authority = SOURCE_AUTHORITIES.get(url.hostname);
  if (!authority) fail(`${label}.url is not a reviewed source authority`);
  if (!authority.publishers.includes(source.publisher)) {
    fail(`${label}.publisher does not match its reviewed source authority`);
  }
  if (!authority.kinds.includes(source.kind)) {
    fail(`${label}.kind does not match its reviewed source authority`);
  }
}

function validatePath(path, index, sourceMap, usedSourceIds) {
  const label = `source.paths[${index}]`;
  exactKeys(path, ['id', 'title', 'summary', 'urgent', 'steps', 'say'], [], label);
  id(path.id, `${label}.id`);
  plain(path.title, `${label}.title`, { max: 100 });
  plain(path.summary, `${label}.summary`, { max: 220 });
  if (typeof path.urgent !== 'boolean') fail(`${label}.urgent must be a boolean`);
  if (path.urgent !== (path.id === 'leave-now')) {
    fail('only leave-now may be marked urgent');
  }
  plain(path.say, `${label}.say`, { max: 260 });

  const steps = list(path.steps, `${label}.steps`, { min: 3, max: 8 });
  steps.forEach((step, stepIndex) => {
    const stepLabel = `${label}.steps[${stepIndex}]`;
    exactKeys(step, ['id', 'text', 'source_ids'], [], stepLabel);
    id(step.id, `${stepLabel}.id`);
    plain(step.text, `${stepLabel}.text`, { max: 360 });
    sourceIds(step.source_ids, `${stepLabel}.source_ids`, sourceMap, usedSourceIds);
  });
  unique(steps.map((step) => step.id), `${label}.steps`);
  exactOrder(
    steps.map((step) => step.id),
    PATH_STEP_ORDER[path.id],
    `${label}.steps`
  );
}

function validateSupportNeed(need, index, sourceMap, usedSourceIds) {
  const label = `source.support_needs[${index}]`;
  exactKeys(need, ['id', 'title', 'ask', 'source_ids'], [], label);
  id(need.id, `${label}.id`);
  plain(need.title, `${label}.title`, { max: 100 });
  plain(need.ask, `${label}.ask`, { max: 260 });
  sourceIds(need.source_ids, `${label}.source_ids`, sourceMap, usedSourceIds);
}

function referenceSource(sourceId, label, regionId, sourceMap, usedSourceIds) {
  id(sourceId, label);
  const referenced = sourceMap.get(sourceId);
  if (!referenced) fail(`${label} names missing source ${sourceId}`);
  if (referenced.region !== regionId && referenced.region !== 'global') {
    fail(`${label} must name a source for ${regionId} or global`);
  }
  usedSourceIds.add(sourceId);
}

function validateRegion(region, index, sourceMap, usedSourceIds) {
  const label = `source.regions[${index}]`;
  exactKeys(region, ['id', 'title', 'scope', 'emergency', 'links'], [], label);
  id(region.id, `${label}.id`);
  plain(region.title, `${label}.title`, { max: 100 });
  if (region.title !== REGION_TITLES[region.id]) {
    fail(`${label}.title must remain ${REGION_TITLES[region.id]}`);
  }
  plain(region.scope, `${label}.scope`, { max: 300 });

  const expectedCall = REGION_CALLS[region.id];
  if (expectedCall === null) {
    if (region.emergency !== null) fail(`${label}.emergency must remain null`);
  } else {
    exactKeys(region.emergency, ['display', 'call', 'source_id'], [], `${label}.emergency`);
    plain(region.emergency.display, `${label}.emergency.display`, { max: 60 });
    if (region.emergency.display !== REGION_DISPLAYS[region.id]) {
      fail(
        `${label}.emergency.display must remain ${REGION_DISPLAYS[region.id]}`
      );
    }
    if (
      typeof region.emergency.call !== 'string' ||
      !/^tel:(?:000|111|112|911|999)$/u.test(region.emergency.call)
    ) {
      fail(`${label}.emergency.call must be a safe emergency tel link`);
    }
    if (region.emergency.call !== expectedCall) {
      fail(`${label}.emergency.call must remain ${expectedCall}`);
    }
    referenceSource(
      region.emergency.source_id,
      `${label}.emergency.source_id`,
      region.id,
      sourceMap,
      usedSourceIds
    );
  }

  const links = list(region.links, `${label}.links`, { min: 1, max: 12 });
  links.forEach((link, linkIndex) => {
    const linkLabel = `${label}.links[${linkIndex}]`;
    exactKeys(link, ['label', 'purpose', 'source_id', 'live'], [], linkLabel);
    plain(link.label, `${linkLabel}.label`, { max: 120 });
    plain(link.purpose, `${linkLabel}.purpose`, { max: 180 });
    if (link.live !== true) fail(`${linkLabel}.live must be true`);
    referenceSource(
      link.source_id,
      `${linkLabel}.source_id`,
      region.id,
      sourceMap,
      usedSourceIds
    );
  });
  unique(links.map((link) => link.source_id), `${label}.links`);
}

function validateBoundary(boundary) {
  exactKeys(
    boundary,
    ['live_status', 'authority', 'emergency', 'privacy', 'not_included'],
    [],
    'source.boundary'
  );
  for (const key of ['live_status', 'authority', 'emergency', 'privacy']) {
    plain(boundary[key], `source.boundary.${key}`, { max: 260 });
    if (boundary[key] !== BOUNDARY[key]) {
      fail(`source.boundary.${key} must preserve the safety boundary`);
    }
  }
  list(boundary.not_included, 'source.boundary.not_included', { min: 4, max: 12 });
  boundary.not_included.forEach((entry, index) =>
    plain(entry, `source.boundary.not_included[${index}]`, { max: 220 })
  );
  exactOrder(
    boundary.not_included,
    BOUNDARY.not_included,
    'source.boundary.not_included'
  );
}

function validateCoreSafety(source) {
  const byId = new Map(source.paths.map((path) => [path.id, path]));
  const leave = byId.get('leave-now');
  const smoke = byId.get('smoke-health');
  const away = byId.get('safe-away');
  const returning = byId.get('return-home');

  if (leave.summary !== CORE_TEXT.leave_summary) {
    fail('leave-now must preserve the leave-first boundary');
  }
  if (leave.steps[0].text !== CORE_TEXT.leave_step) {
    fail('leave-now must preserve immediate evacuation over property');
  }
  if (smoke.steps[0].text !== CORE_TEXT.smoke_step) {
    fail('smoke-health must preserve evacuation orders first');
  }
  if (smoke.steps[2].text !== CORE_TEXT.respirator_step) {
    fail('smoke-health must preserve the country-certified respirator limit');
  }
  if (away.steps[2].text !== CORE_TEXT.away_return_step) {
    fail('safe-away must preserve the no-return boundary');
  }
  if (returning.summary !== CORE_TEXT.return_summary) {
    fail('return-home must preserve explicit clearance');
  }
  if (returning.steps[0].text !== CORE_TEXT.return_step) {
    fail('return-home must preserve the official-clearance gate');
  }
  if (returning.steps[2].text !== CORE_TEXT.return_water_step) {
    fail('return-home must preserve the local water and food boundary');
  }
  if (returning.steps[4].text !== CORE_TEXT.return_ash_step) {
    fail('return-home must preserve the hazardous-ash boundary');
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function decodeSourceBytes(sourceBytes) {
  if (!(typeof sourceBytes === 'string' || sourceBytes instanceof Uint8Array)) {
    fail('sourceBytes must be a string or byte array');
  }
  const byteLength =
    typeof sourceBytes === 'string'
      ? new TextEncoder().encode(sourceBytes).byteLength
      : sourceBytes.byteLength;
  if (byteLength < 2 || byteLength > MAX_SOURCE_BYTES) {
    fail(`sourceBytes must contain 2-${MAX_SOURCE_BYTES} bytes`);
  }
  if (typeof sourceBytes === 'string') return sourceBytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  } catch {
    fail('sourceBytes must be valid UTF-8');
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateSourceRoot(source, today) {
  exactKeys(
    source,
    [
      'schema_version',
      'title',
      'description',
      'reviewed_at',
      'next_review_due',
      'care',
      'boundary',
      'paths',
      'support_needs',
      'regions',
      'sources',
      'rights',
      'correction',
    ],
    [],
    'source'
  );
  if (source.schema_version !== SCHEMA_VERSION) fail('unsupported schema_version');
  plain(source.title, 'source.title', { max: 100 });
  plain(source.description, 'source.description', { max: 300 });
  calendarDate(source.reviewed_at, 'source.reviewed_at');
  calendarDate(source.next_review_due, 'source.next_review_due');
  if (daysBetween(source.reviewed_at, today) < 0) {
    fail('options.today must not be before source.reviewed_at');
  }
  if (daysBetween(today, source.next_review_due) < 0) {
    fail('the wildfire review is overdue for options.today');
  }
  const reviewWindow = daysBetween(source.reviewed_at, source.next_review_due);
  if (reviewWindow <= 0 || reviewWindow > MAX_REVIEW_WINDOW_DAYS) {
    fail(`source.next_review_due must follow review within ${MAX_REVIEW_WINDOW_DAYS} days`);
  }

  exactKeys(source.care, ['title', 'message', 'next_step'], [], 'source.care');
  plain(source.care.title, 'source.care.title', { max: 100 });
  plain(source.care.message, 'source.care.message', { max: 300 });
  plain(source.care.next_step, 'source.care.next_step', { max: 180 });
  validateBoundary(source.boundary);

  const regions = list(source.regions, 'source.regions', {
    min: REGION_ORDER.length,
    max: REGION_ORDER.length,
  });
  exactOrder(regions.map((region) => region.id), REGION_ORDER, 'source.regions');
  const regionSet = new Set(REGION_ORDER);

  const sources = list(source.sources, 'source.sources', { min: 12, max: 80 });
  sources.forEach((entry, index) =>
    validateSource(entry, index, source.reviewed_at, regionSet)
  );
  unique(sources.map((entry) => entry.id), 'source.sources');
  const sourceMap = new Map(sources.map((entry) => [entry.id, entry]));
  const usedSourceIds = new Set();

  const paths = list(source.paths, 'source.paths', {
    min: PATH_ORDER.length,
    max: PATH_ORDER.length,
  });
  exactOrder(paths.map((path) => path.id), PATH_ORDER, 'source.paths');
  paths.forEach((path, index) =>
    validatePath(path, index, sourceMap, usedSourceIds)
  );

  const supportNeeds = list(source.support_needs, 'source.support_needs', {
    min: 1,
    max: 16,
  });
  supportNeeds.forEach((need, index) =>
    validateSupportNeed(need, index, sourceMap, usedSourceIds)
  );
  unique(supportNeeds.map((need) => need.id), 'source.support_needs');

  regions.forEach((region, index) =>
    validateRegion(region, index, sourceMap, usedSourceIds)
  );

  for (const sourceId of sourceMap.keys()) {
    if (!usedSourceIds.has(sourceId)) fail(`source ${sourceId} is never cited`);
  }

  validateCoreSafety(source);

  exactKeys(source.rights, ['summary', 'reuse'], [], 'source.rights');
  plain(source.rights.summary, 'source.rights.summary', { max: 260 });
  plain(source.rights.reuse, 'source.rights.reuse', { max: 220 });
  if (source.correction !== 'https://github.com/cambridgetcg/mindicraft/issues') {
    fail('source.correction must point to the Mindicraft issue tracker');
  }
}

export function prepareWildfireHelp(source, options) {
  exactKeys(options, ['sourceBytes', 'today'], [], 'options');
  calendarDate(options.today, 'options.today');
  const { sourceBytes, today } = options;
  assertSafeTree(source, 'source');
  const text = decodeSourceBytes(sourceBytes);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('sourceBytes must contain JSON');
  }
  assertSafeTree(parsed, 'sourceBytes');
  if (canonical(source) !== canonical(parsed)) {
    fail('source must exactly match sourceBytes');
  }
  validateSourceRoot(parsed, today);

  const frozenSource = deepFreeze(parsed);
  const counts = Object.freeze({
    paths: frozenSource.paths.length,
    support_needs: frozenSource.support_needs.length,
    regions: frozenSource.regions.length,
    sources: frozenSource.sources.length,
  });
  const freshness = Object.freeze({
    today,
    reviewed_at: frozenSource.reviewed_at,
    next_review_due: frozenSource.next_review_due,
    current: true,
  });
  return Object.freeze({
    source: frozenSource,
    sourceDigest: `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`,
    counts,
    freshness,
  });
}
