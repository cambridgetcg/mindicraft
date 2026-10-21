import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  LANGUAGES, PILOT, buildReport, extractQuantities, inspectMarkdown, renderReport,
} from './warnings-across-languages.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/warnings-across-languages.json', import.meta.url), 'utf8'));
const pathFor = (guide, lang) => `guide/content/${lang}/review-fixtures/${guide}.md`;
const pilot = {
  id: 'synthetic-paper-cards', history: 'Synthetic fixture; no external safety claim.', selected_on: '2026-10-21',
  roles: ['card-a', 'card-b'].map((guide) => ({
    id: guide, guide: `review-fixtures/${guide}`, quantity_group: 'card-duration',
    selectors: Object.fromEntries(LANGUAGES.map((lang) => [lang, { section: fixture.sections[lang], anchor: fixture.anchors[lang] }])),
  })),
};
function syntheticDocuments() {
  return Object.fromEntries(['card-a', 'card-b'].flatMap((guide) => LANGUAGES.map((lang) => [
    pathFor(guide, lang),
    `---\ntime: 999 minutes\n---\n\n## ${fixture.sections[lang]}\n\n1. Context\n   - ${fixture.lines[lang]}\n`,
  ])));
}
function liveDocuments() {
  return Object.fromEntries([...new Set(PILOT.roles.map((r) => r.guide))].flatMap((guide) => LANGUAGES.map((lang) => {
    const path = `guide/content/${lang}/${guide}.md`;
    return [path, readFileSync(join(ROOT, path), 'utf8')];
  })));
}
const codes = (report) => [...new Set(report.signals.map((s) => s.code))].sort();

test('warning pilot reports live coverage without gating wording and preserves returned spans and digests', (t) => {
  const docs = liveDocuments();
  const report = buildReport(docs);
  assert.equal(report.sources.length, 8);
  assert.equal(report.passages.length, 16);
  for (const source of report.sources) {
    assert.equal(source.sha256, createHash('sha256').update(docs[source.path]).digest('hex'));
  }
  for (const passage of report.passages) {
    const lines = docs[passage.path].split(/\r?\n/u);
    for (const match of passage.matches) {
      assert.equal(match.text, lines.slice(match.line - 1, match.end_line).join('\n'));
      for (const parent of match.parents) assert.equal(parent.text, lines[parent.line - 1]);
    }
  }
  // Live content may change independently of this aid; only report fidelity gates tests.
  const located = report.passages.filter((p) => p.status === 'located').length;
  t.diagnostic(`Live pilot: ${located}/${report.passages.length} passages located; signals: ${codes(report).join(', ') || 'none'}. Selection and quantity signals are advisory.`);
  assert.ok(report.review_questions.every((q) => q.status === 'pending'));
  assert.equal(report.review_questions.filter((q) => q.review === 'subject').length, 1);
});

test('warning report is deterministic, non-mutating, and has separate bilingual and subject questions', () => {
  const docs = syntheticDocuments();
  const before = JSON.stringify(docs);
  const report = buildReport(docs, pilot);
  assert.deepEqual(report, buildReport(docs, pilot));
  assert.equal(renderReport(report), renderReport(buildReport(docs, pilot)));
  assert.equal(JSON.stringify(docs), before);
  assert.deepEqual(report.signals, []);
  assert.ok(report.review_questions.some((q) => q.id === 'correctness' && q.question.includes('to re-observe')));
  for (const lang of LANGUAGES.slice(1)) {
    for (const topic of ['selection', 'conditions', 'prohibitions', 'actions', 'quantities']) {
      assert.ok(report.review_questions.some((q) => q.id === `${topic}-en-${lang}`));
    }
  }
});

for (const example of fixture.cases) {
  test(`warning fixture ${example.classification}: ${example.id}`, () => {
    const docs = syntheticDocuments();
    for (const edit of example.edits) {
      for (const guide of edit.guide ? [edit.guide] : ['card-a', 'card-b']) {
        const path = pathFor(guide, edit.lang);
        assert.ok(docs[path].includes(edit.from), `stale mutation: ${example.id}`);
        docs[path] = docs[path].replace(edit.from, edit.to);
      }
    }
    const report = buildReport(docs, pilot);
    assert.deepEqual(codes(report), example.signals.sort());
    assert.ok(report.review_questions.every((q) => q.status === 'pending'));
    if (example.id === 'shared-source-mistake') {
      assert.ok(report.passages.every((p) => p.matches[0].quantities[0].value === 15));
      assert.match(renderReport(report), /No mechanical signal; all review questions remain pending/u);
    }
  });
}

test('missing source, missing or duplicate anchors, and malformed Markdown are visible', () => {
  const path = pathFor('card-a', 'yue');
  const missing = syntheticDocuments();
  delete missing[path];
  let report = buildReport(missing, pilot);
  assert.deepEqual(codes(report), ['passage-missing', 'source-missing']);
  assert.equal(report.comparisons[0].status, 'incomplete');
  assert.equal(report.passages.find((p) => p.path === path).matches.length, 0);

  const renamed = syntheticDocuments();
  renamed[path] = renamed[path].replace(fixture.anchors.yue, '改名：');
  report = buildReport(renamed, pilot);
  assert.deepEqual(codes(report), ['passage-missing']);

  const duplicate = syntheticDocuments();
  duplicate[path] += `   - ${fixture.lines.yue}\n`;
  report = buildReport(duplicate, pilot);
  assert.deepEqual(codes(report), ['passage-ambiguous', 'structure-difference']);
  assert.equal(report.passages.find((p) => p.path === path).matches.length, 2);
  assert.equal(report.comparisons[0].status, 'incomplete');

  const broken = syntheticDocuments();
  broken[path] = '---\nno closing delimiter';
  report = buildReport(broken, pilot);
  assert.deepEqual(codes(report), ['passage-missing', 'source-unparsed']);
});

test('physical locations survive CRLF, wrapped list items, frontmatter and fenced decoys', () => {
  const raw = [
    '---', 'time: 999 minutes', '---', '```md', '## Decoy', '- ten minutes', '```',
    '## Steps', '1. Context', '   - Review card: wait', '     ten full minutes.', '2. Next', '',
  ].join('\r\n');
  const parsed = inspectMarkdown(raw);
  assert.deepEqual(parsed.headings, [{ line: 8, level: 2, text: 'Steps' }]);
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[1].line, 10);
  assert.equal(parsed.items[1].end_line, 11);
  assert.equal(parsed.items[1].parents[0].line, 9);
  assert.deepEqual(extractQuantities(parsed.items[1].text, 10).map((q) => [q.line, q.value, q.unit]), [[11, 10, 'minute']]);
  assert.throws(() => inspectMarkdown('~~~\nno closing fence'), /Unclosed/u);
});

test('quantity candidates preserve raw evidence, repeated values, units and unsupported tokens', () => {
  const text = 'ten full minutes; diez minutos; 十分钟; 十五分鐘; ３０分鐘; 1,5 horas; 10–15 minutes; doce minutos; minutes';
  const quantities = extractQuantities(text, 7);
  assert.deepEqual(quantities.map((q) => q.value), [10, 10, 10, 15, 30, 1.5, null, null, null]);
  assert.equal(quantities[5].unit, 'hour');
  for (const q of quantities) {
    assert.equal(q.line, 7);
    assert.equal(text.slice(q.column - 1, q.column - 1 + q.raw.length), q.raw);
  }
  assert.deepEqual(extractQuantities('ten millimeters; diez libros'), []);
  assert.equal(extractQuantities('-10 minutes')[0].value, -10);
  for (const ambiguous of [
    'one hundred ten minutes', '10 to 15 minutes', '十至十五分鐘',
    '10 or 15 minutes', '10 o 15 minutos', '10 u 11 minutos', '十或十五分钟',
    '1,000 minutes', '1.000 minutos', '10000000000000000 minutes',
  ]) {
    assert.equal(extractQuantities(ambiguous)[0].status, 'unparsed', ambiguous);
  }
});

test('alternative quantities cannot silently agree with their final candidate', () => {
  for (const [lang, from, alternative, finalValue] of [
    ['en', 'ten minutes', '10 or 15 minutes', '15'],
    ['es', 'diez minutos', '10 o 15 minutos', '15'],
    ['es', 'diez minutos', '10 u 11 minutos', '11'],
  ]) {
    const docs = syntheticDocuments();
    docs[pathFor('card-a', lang)] = docs[pathFor('card-a', lang)].replace(from, alternative);
    for (const path of Object.keys(docs)) {
      docs[path] = docs[path].replace(/ten|diez|十/u, finalValue);
    }
    const report = buildReport(docs, pilot);
    assert.deepEqual(codes(report), ['quantity-unparsed'], alternative);
    assert.equal(report.comparisons[0].status, 'incomplete', alternative);
  }
});

test('CLI works from another directory, emits relative paths, and rejects write options', () => {
  const script = join(ROOT, 'test/warnings-across-languages.mjs');
  const invoke = (args, cwd = ROOT) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  const before = liveDocuments();
  const json = invoke(['--json']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(json.stdout, invoke(['--json'], join(ROOT, 'guide')).stdout);
  assert.deepEqual(JSON.parse(json.stdout), buildReport(before));
  assert.ok(!json.stdout.includes(ROOT));
  assert.equal(invoke([]).stdout, renderReport(buildReport(before)));
  assert.equal(invoke(['--help']).status, 0);
  assert.equal(invoke(['--write']).status, 1);
  assert.deepEqual(liveDocuments(), before);
});
