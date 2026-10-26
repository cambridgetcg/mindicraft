// The season ahead: one dated, sourced outlook at the top of each home page.
//
// A forecast goes stale in weeks, so it carries its own check date. Until then
// the build shows it; after that the build leaves it out instead of
// publishing an old forecast, and copies already saved or printed say they are
// out of date. Renewing it means reading the newest official outlook and
// moving the dates on, never only the dates.

const SCHEMA_VERSION = 'mindicraft.season/1';
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MONTH = /^\d{4}-\d{2}$/u;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
// From the official outlook it rests on to the day it must come down.
const MAX_CHECK_WINDOW_DAYS = 45;
const DAY_MS = 86_400_000;

const TOP_KEYS = [
  'schema_version',
  'id',
  'as_of',
  'check_by',
  'outlook',
  'sea_anomaly_c',
  'sea_anomaly_month',
  'print',
  'carbon_monoxide_sources',
  'languages',
];
const OUTLOOK_KEYS = ['publisher', 'url', 'published', 'next_update'];
const SOURCE_KEYS = ['name', 'url'];
const LANGUAGE_KEYS = [
  'date_locale',
  'kicker',
  'title',
  'lede',
  'diagram',
  'where',
  'go',
  'places',
  'print_title',
  'print_lede',
  'co_lead',
  'co_text',
  'source_line',
  'stale',
];
const DIAGRAM_KEYS = ['title', 'desc', 'west', 'east', 'drift', 'rain', 'dry', 'caption'];
const PLACE_KEYS = ['place', 'tends', 'sources', 'guides'];
const PLACEHOLDERS = {
  source_line: ['{outlook}', '{published}', '{next_update}', '{check_by}'],
  stale: ['{check_by}'],
};
const CAPTION_SLOTS = ['{anomaly}', '{month}'];
// A slot that is not filled would ship as raw {text}: allow only these.
const onlySlots = (value, allowed, label) => {
  for (const slot of value.match(/\{[^}]*\}/gu) || []) {
    if (!allowed.includes(slot)) fail(`${label} has unknown slot ${slot}`);
  }
};

const fail = (message) => {
  throw new Error(`season: ${message}`);
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

const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    fail(`${label} must be non-empty trimmed text`);
  }
  return value;
};

const calendarDate = (value, label) => {
  if (typeof value !== 'string' || !DATE.test(value)) fail(`${label} must be YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real calendar date`);
  }
  return date;
};

const httpsUrl = (value, label) => {
  text(value, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a URL`);
  }
  if (url.protocol !== 'https:') fail(`${label} must use https`);
  return value;
};

const guideList = (value, slugs, label, { min, max }) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must list ${min}–${max} guides`);
  }
  if (new Set(value).size !== value.length) fail(`${label} repeats a guide`);
  for (const slug of value) if (!slugs.has(slug)) fail(`${label} names unknown guide ${slug}`);
};

// Every claim names where it comes from: one to three https sources.
const sourceList = (value, label) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) fail(`${label} must hold 1–3 sources`);
  value.forEach((source, i) => {
    exactKeys(source, SOURCE_KEYS, `${label}[${i}]`);
    text(source.name, `${label}[${i}].name`);
    httpsUrl(source.url, `${label}[${i}].url`);
  });
};

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export function prepareSeason(source, { slugs, languages, today }) {
  exactKeys(source, TOP_KEYS, 'season');
  if (source.schema_version !== SCHEMA_VERSION) fail(`schema_version must be ${SCHEMA_VERSION}`);
  if (typeof source.id !== 'string' || !SAFE_ID.test(source.id)) fail('id must be a lowercase slug');

  exactKeys(source.outlook, OUTLOOK_KEYS, 'outlook');
  text(source.outlook.publisher, 'outlook.publisher');
  httpsUrl(source.outlook.url, 'outlook.url');
  const published = calendarDate(source.outlook.published, 'outlook.published');
  const nextUpdate = calendarDate(source.outlook.next_update, 'outlook.next_update');
  const asOf = calendarDate(source.as_of, 'as_of');
  const checkBy = calendarDate(source.check_by, 'check_by');
  if (nextUpdate <= published) fail('outlook.next_update must come after outlook.published');
  if (asOf < published) fail('as_of cannot come before the outlook it rests on');
  if (checkBy < asOf) fail('check_by cannot come before as_of');
  if (checkBy < nextUpdate) fail('check_by cannot come before the next official update');
  if ((checkBy - published) / DAY_MS > MAX_CHECK_WINDOW_DAYS) {
    fail(`check_by must fall within ${MAX_CHECK_WINDOW_DAYS} days of the outlook`);
  }

  // The words say "above normal", so the number must be above zero.
  if (typeof source.sea_anomaly_c !== 'number' || !(source.sea_anomaly_c > 0) || source.sea_anomaly_c > 10) {
    fail('sea_anomaly_c must be a warm anomaly above 0 °C');
  }
  if (typeof source.sea_anomaly_month !== 'string' || !MONTH.test(source.sea_anomaly_month)) {
    fail('sea_anomaly_month must be YYYY-MM');
  }
  calendarDate(`${source.sea_anomaly_month}-01`, 'sea_anomaly_month');
  guideList(source.print, slugs, 'print', { min: 1, max: 8 });
  sourceList(source.carbon_monoxide_sources, 'carbon_monoxide_sources');

  exactKeys(source.languages, languages, 'languages');
  for (const code of languages) {
    const words = source.languages[code];
    const label = `languages.${code}`;
    exactKeys(words, LANGUAGE_KEYS, label);
    for (const key of LANGUAGE_KEYS) {
      if (key === 'diagram' || key === 'places') continue;
      text(words[key], `${label}.${key}`);
    }
    try {
      new Intl.DateTimeFormat(words.date_locale);
    } catch {
      fail(`${label}.date_locale is not a locale`);
    }
    for (const [key, needed] of Object.entries(PLACEHOLDERS)) {
      for (const slot of needed) {
        if (!words[key].includes(slot)) fail(`${label}.${key} must contain ${slot}`);
      }
    }
    for (const key of LANGUAGE_KEYS) {
      if (key === 'diagram' || key === 'places') continue;
      onlySlots(words[key], PLACEHOLDERS[key] || [], `${label}.${key}`);
    }
    exactKeys(words.diagram, DIAGRAM_KEYS, `${label}.diagram`);
    for (const key of DIAGRAM_KEYS) text(words.diagram[key], `${label}.diagram.${key}`);
    if (!words.diagram.caption.includes('{anomaly}')) fail(`${label}.diagram.caption must contain {anomaly}`);
    for (const key of DIAGRAM_KEYS) {
      onlySlots(words.diagram[key], key === 'caption' ? CAPTION_SLOTS : [], `${label}.diagram.${key}`);
    }
    if (!Array.isArray(words.places) || words.places.length < 3 || words.places.length > 8) {
      fail(`${label}.places must hold 3–8 places`);
    }
    words.places.forEach((place, i) => {
      const where = `${label}.places[${i}]`;
      exactKeys(place, PLACE_KEYS, where);
      for (const key of ['place', 'tends']) {
        text(place[key], `${where}.${key}`);
        onlySlots(place[key], [], `${where}.${key}`);
      }
      sourceList(place.sources, `${where}.sources`);
      guideList(place.guides, slugs, `${where}.guides`, { min: 0, max: 3 });
    });
  }

  if (typeof today !== 'string' || !DATE.test(today)) fail('today must be YYYY-MM-DD');
  return deepFreeze({ ...structuredClone(source), current: today <= source.check_by });
}

// Dates and the sea number in each reader's own way of writing them.
export function seasonWords(season, code) {
  const words = season.languages[code];
  const day = (iso) =>
    new Intl.DateTimeFormat(words.date_locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  const month = new Intl.DateTimeFormat(words.date_locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${season.sea_anomaly_month}-01T00:00:00Z`)
  );
  const anomaly = `${new Intl.NumberFormat(words.date_locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(season.sea_anomaly_c)} °C`;
  return {
    words,
    anomaly,
    month,
    published: day(season.outlook.published),
    nextUpdate: day(season.outlook.next_update),
    checkBy: day(season.check_by),
  };
}
