import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prepareSeason, seasonWords } from '../guide/season.mjs';

const read = (name) => JSON.parse(readFileSync(new URL(`../guide/${name}`, import.meta.url), 'utf8'));
const source = read('season.json');
const tree = read('tree.json');
const languages = read('langs.json').languages.map((language) => language.code);
const slugs = new Set(tree.domains.flatMap((domain) => domain.guides.map((guide) => guide.slug)));
const copy = () => structuredClone(source);
const prepare = (value = copy(), today = source.as_of) => prepareSeason(value, { slugs, languages, today });

test('the committed season is valid in every language and current on its own date', () => {
  const season = prepare();
  assert.equal(season.current, true);
  assert.deepEqual(Object.keys(season.languages), languages);
  assert.equal(Object.isFrozen(season.languages.en.places[0].sources), true);
});

test('the season comes down the day after its check date, and not before', () => {
  assert.equal(prepare(copy(), source.check_by).current, true);
  const next = new Date(`${source.check_by}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  assert.equal(prepare(copy(), next.toISOString().slice(0, 10)).current, false);
});

test('a check date cannot be pushed far past the outlook it rests on', () => {
  const value = copy();
  value.check_by = '2027-01-31';
  assert.throws(() => prepare(value), /within 45 days/u);
});

test('a check date cannot fall before the next official update', () => {
  const value = copy();
  value.check_by = '2026-11-01';
  assert.throws(() => prepare(value), /next official update/u);
});

test('every guide named must exist', () => {
  const printed = copy();
  printed.print.push('read-the-tides');
  assert.throws(() => prepare(printed), /unknown guide read-the-tides/u);
  const placed = copy();
  placed.languages.es.places[0].guides = ['boil-water', 'boil-water'];
  assert.throws(() => prepare(placed), /repeats a guide/u);
});

test('every language is present, and only those', () => {
  const missing = copy();
  delete missing.languages.yue;
  assert.throws(() => prepare(missing), /missing yue/u);
  const extra = copy();
  extra.languages.fr = extra.languages.en;
  assert.throws(() => prepare(extra), /unknown field fr/u);
});

test('every claim carries an https source', () => {
  const none = copy();
  none.languages.en.places[0].sources = [];
  assert.throws(() => prepare(none), /1–3 sources/u);
  const plain = copy();
  plain.languages.zh.places[0].sources[0].url = 'http://www.hko.gov.hk/';
  assert.throws(() => prepare(plain), /must use https/u);
});

test('the source line and the stale note keep their dates', () => {
  const value = copy();
  value.languages.es.source_line = value.languages.es.source_line.replace('{check_by}', 'pronto');
  assert.throws(() => prepare(value), /source_line must contain \{check_by\}/u);
  const stale = copy();
  stale.languages.zh.stale = '可能已经过时。';
  assert.throws(() => prepare(stale), /stale must contain \{check_by\}/u);
});

test('dates and the sea number are written the way each reader writes them', () => {
  const season = prepare();
  const en = seasonWords(season, 'en');
  assert.equal(en.published, '8 October 2026');
  assert.equal(en.anomaly, '2.1 °C');
  assert.equal(en.month, 'September');
  const es = seasonWords(season, 'es');
  assert.equal(es.checkBy, '19 de noviembre de 2026');
  assert.equal(es.anomaly, '2,1 °C');
  assert.equal(seasonWords(season, 'zh').nextUpdate, '2026年11月12日');
  assert.equal(seasonWords(season, 'yue').published, '2026年10月8日');
});

test('a slot nobody fills is refused, so raw {text} never ships', () => {
  const caption = copy();
  caption.languages.es.diagram.caption = caption.languages.es.diagram.caption.replace('{month}', '{mes}');
  assert.throws(() => prepare(caption), /unknown slot \{mes\}/u);
  const place = copy();
  place.languages.yue.places[0].tends += '{check_by}';
  assert.throws(() => prepare(place), /unknown slot \{check_by\}/u);
});

test('the sea number must be a warm anomaly, as the words say', () => {
  for (const value of [-1.2, 0, Number.NaN, '2.1']) {
    const season = copy();
    season.sea_anomaly_c = value;
    assert.throws(() => prepare(season), /warm anomaly/u, String(value));
  }
});
