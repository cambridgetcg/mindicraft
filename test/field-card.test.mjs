import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { marked } from '../guide/node_modules/marked/lib/marked.esm.js';
import { countItems, numberSteps, splitFieldCard } from '../guide/field-card.mjs';

const guideUrl = (path) => new URL(`../guide/${path}`, import.meta.url);
const tree = JSON.parse(readFileSync(guideUrl('tree.json'), 'utf8'));
const languages = JSON.parse(readFileSync(guideUrl('langs.json'), 'utf8')).languages;
const english = languages.find((language) => language.code === 'en');
const bodyOf = (raw) => raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)[1];
const guideCount = tree.domains.reduce((sum, domain) => sum + domain.guides.length, 0);

// As the build does: a missing translation shows the English guide, cut by
// the English headings.
const guides = [];
for (const language of languages)
  for (const domain of tree.domains)
    for (const guide of domain.guides) {
      const own = `content/${language.code}/${domain.key}/${guide.slug}.md`;
      const source = existsSync(guideUrl(own)) ? language : english;
      const path = `content/${source.code}/${domain.key}/${guide.slug}.md`;
      guides.push({
        path: `${language.code}: ${path}`,
        headings: source.strings.fieldCard.headings,
        body: bodyOf(readFileSync(guideUrl(path), 'utf8')),
      });
    }

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const stepsOf = (card) => numberSteps(marked.parse(card.front.find((s) => s.kind === 'steps').markdown));

test('every guide in every language becomes a card', () => {
  assert.equal(guides.length, languages.length * guideCount);
  for (const { path, headings, body } of guides) {
    const card = splitFieldCard(body, headings);
    assert.ok(card, `${path} has ${headings.need}, ${headings.steps}, ${headings.watch} once each, in order`);
    assert.deepEqual(
      card.front.map((s) => s.kind).filter(Boolean),
      ['need', 'steps', 'watch'],
      path
    );
    assert.equal(card.front.at(-1).kind, 'watch', `${path}: the warnings close the front`);
    for (const { title } of card.back)
      assert.ok(!Object.values(headings).includes(title), `${path}: "${title}" belongs on the front`);
  }
});

test('the card is a cut, never an edit: every byte of the body survives in order', () => {
  for (const { path, headings, body } of guides) {
    const card = splitFieldCard(body, headings);
    const joined = [card.intro, ...card.front, ...card.back]
      .map((part) => (typeof part === 'string' ? part : part.markdown))
      .join('');
    assert.equal(joined, body, path);
  }
});

test('rendered piece by piece, the card reads exactly as the whole guide did', () => {
  for (const { path, headings, body } of guides) {
    const card = splitFieldCard(body, headings);
    const pieces = [
      marked.parse(card.intro),
      ...[...card.front, ...card.back].map(({ kind, markdown }) =>
        kind === 'steps' ? numberSteps(marked.parse(markdown)).html : marked.parse(markdown)
      ),
    ].join('\n');
    assert.equal(textOf(pieces), textOf(marked.parse(body)), path);
  }
});

test('each numbered step gets one anchor, and a glance lead is its step’s own bold opening', () => {
  for (const { path, headings, body } of guides) {
    const steps = stepsOf(splitFieldCard(body, headings));
    const ids = [...steps.html.matchAll(/id="step-(\d+)"/g)].map((m) => Number(m[1]));
    assert.ok(steps.count > 0, path);
    assert.deepEqual(ids, Array.from({ length: steps.count }, (_, i) => i + 1), path);
    if (!steps.leads) continue;
    assert.equal(steps.leads.length, steps.count, path);
    steps.leads.forEach(({ html }, i) =>
      assert.ok(
        steps.html.includes(`<li id="step-${i + 1}"><strong>${html}</strong>`) ||
          steps.html.includes(`<li id="step-${i + 1}"><p><strong>${html}</strong>`),
        `${path}: lead ${i + 1} is the bold the step opens with`
      )
    );
  }
});

test('a glance lists step leads only when every step opens with bold, and marks the cut ones', () => {
  const leadsOf = (markdown) => numberSteps(marked.parse(markdown)).leads;
  assert.deepEqual(leadsOf('1. **Light it.** Then wait.\n2. **Feed it**: small sticks first.\n'), [
    { html: 'Light it.', whole: true },
    { html: 'Feed it', whole: true },
  ]);
  assert.deepEqual(leadsOf('1. **“Stop.”** Then look.\n2. **Breathe (slowly).** Count four.\n'), [
    { html: '“Stop.”', whole: true },
    { html: 'Breathe (slowly).', whole: true },
  ]);
  // The author's sentence runs on: the glance keeps the words and marks the cut.
  assert.deepEqual(leadsOf('1. **Dig roots in autumn,** when plants store energy.\n'), [
    { html: 'Dig roots in autumn,', whole: false },
  ]);
  assert.deepEqual(leadsOf('1. **Dig a pit** in bare soil.\n2. **秋冬掘根**，呢陣時。\n'), [
    { html: 'Dig a pit', whole: false },
    { html: '秋冬掘根', whole: false },
  ]);
  // A step without bold leaves the glance without leads.
  assert.equal(leadsOf('1. **Light it.** Then wait.\n2. Feed it.\n'), null);
  // Bold that closes after CJK punctuation does not render as bold, so the
  // page shows no lead; neither does the glance.
  assert.equal(leadsOf('1. **晾皂。**把皂块放在阴凉处。\n'), null);
  assert.deepEqual(leadsOf('1. **晾皂。** 把皂块放在阴凉处。\n'), [{ html: '晾皂。', whole: true }]);
  // Two lists in the steps would number the glance differently from the page.
  assert.equal(leadsOf('1. **Cover it.** Now.\n\n### If it rains\n\n1. **Shield it.** Now.\n'), null);
  assert.equal(leadsOf('No list here.\n'), null);

  const spark = guides.find((g) => g.path === 'en: content/en/fire/spark-fire.md');
  const leads = stepsOf(splitFieldCard(spark.body, spark.headings)).leads;
  assert.equal(leads.length, 9);
  assert.deepEqual(leads[0], { html: 'Get everything ready first.', whole: true });
});

test('a guide without the three sections, with one repeated, or out of order, keeps its old page', () => {
  const headings = { need: 'You need', steps: 'Steps', watch: 'Watch out' };
  assert.equal(splitFieldCard('Intro.\n\n## Steps\n\n1. Go.\n', headings), null);
  assert.equal(
    splitFieldCard('## Watch out\n\n- Hot.\n\n## You need\n\n- Wood.\n\n## Steps\n\n1. Go.\n', headings),
    null
  );
  assert.equal(
    splitFieldCard(
      '## You need\n\n- Wood.\n\n## Steps\n\n1. Go.\n\n## Watch out\n\n- Hot.\n\n## How it works\n\nWhy.\n\n## Watch out\n\n- Smoke.\n',
      headings
    ),
    null
  );
});

test('sections between the steps and the warnings stay on the front', () => {
  const headings = { need: 'You need', steps: 'Steps', watch: 'Watch out' };
  const body =
    'Intro.\n\n## You need\n\n- Rope.\n\n## Steps\n\n1. Dig.\n\n## The air\n\nBad air kills.\n\n## Watch out\n\n- Gas.\n\n## How it works\n\nWhy.\n';
  const card = splitFieldCard(body, headings);
  assert.deepEqual(
    card.front.map((s) => s.title),
    ['You need', 'Steps', 'The air', 'Watch out']
  );
  assert.deepEqual(card.back.map((s) => s.title), ['How it works']);
  assert.equal(countItems(card.front[0].markdown), 1);
});

test('nested lists inside a step keep their plain items', () => {
  const { html, count } = numberSteps(
    '<ol>\n<li>One<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n</li>\n<li>Two<ol>\n<li>i</li>\n</ol>\n</li>\n</ol>\n'
  );
  assert.equal(count, 2);
  assert.deepEqual([...html.matchAll(/id="step-(\d+)"/g)].map((m) => m[1]), ['1', '2']);
  assert.equal((html.match(/<li>/g) || []).length, 3);
});

test('every language carries the card words', () => {
  const keys = Object.keys(english.strings.fieldCard).sort();
  for (const language of languages) {
    const words = language.strings.fieldCard;
    assert.deepEqual(Object.keys(words).sort(), keys, language.code);
    for (const key of ['needCount', 'stepsCount', 'watchCount']) assert.match(words[key], /\{n\}/u);
    assert.match(words.watchCount, /^⚠ /u, `${language.code}: the ⚠ stays with its word`);
    for (const slot of ['{url}', '{language}', '{edition}', '{evidence}'])
      assert.ok(words.colophon.includes(slot), `${language.code} colophon carries ${slot}`);
    assert.ok(words.edition.includes('{edition}'), language.code);
    assert.ok(words.offCard.includes('{sections}'), language.code);
    for (const value of Object.values(words.headings)) assert.ok(value.trim(), language.code);
  }
});
