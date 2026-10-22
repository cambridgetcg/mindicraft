import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { marked } from '../guide/node_modules/marked/lib/marked.esm.js';
import {
  countItems,
  countSteps,
  numberSteps,
  splitFieldCard,
  stepLeads,
} from '../guide/field-card.mjs';

const guideUrl = (path) => new URL(`../guide/${path}`, import.meta.url);
const tree = JSON.parse(readFileSync(guideUrl('tree.json'), 'utf8'));
const languages = JSON.parse(readFileSync(guideUrl('langs.json'), 'utf8')).languages;
const bodyOf = (raw) => raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)[1];

const guides = [];
for (const language of languages)
  for (const domain of tree.domains)
    for (const guide of domain.guides) {
      const path = `content/${language.code}/${domain.key}/${guide.slug}.md`;
      if (!existsSync(guideUrl(path))) continue;
      guides.push({
        path,
        headings: language.strings.fieldCard.headings,
        body: bodyOf(readFileSync(guideUrl(path), 'utf8')),
      });
    }

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('every guide in every language becomes a card', () => {
  assert.equal(guides.length, languages.length * 134);
  for (const { path, headings, body } of guides) {
    const card = splitFieldCard(body, headings);
    assert.ok(card, `${path} has ${headings.need}, ${headings.steps}, ${headings.watch} in order`);
    assert.deepEqual(
      card.front.map((s) => s.kind).filter(Boolean),
      ['need', 'steps', 'watch'],
      path
    );
    assert.equal(card.front.at(-1).kind, 'watch', `${path}: the warnings close the front`);
    assert.ok(card.back.every((s) => s.kind === null), path);
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
        kind === 'steps' ? numberSteps(marked.parse(markdown)) : marked.parse(markdown)
      ),
    ].join('\n');
    assert.equal(textOf(pieces), textOf(marked.parse(body)), path);
  }
});

test('each numbered step gets one anchor, in order', () => {
  for (const { path, headings, body } of guides) {
    const steps = splitFieldCard(body, headings).front.find((s) => s.kind === 'steps');
    const ids = [...numberSteps(marked.parse(steps.markdown)).matchAll(/id="step-(\d+)"/g)].map(
      (m) => Number(m[1])
    );
    const count = countSteps(steps.markdown);
    assert.ok(count > 0, path);
    assert.deepEqual(ids, Array.from({ length: count }, (_, i) => i + 1), path);
    const leads = stepLeads(steps.markdown);
    if (leads) assert.equal(leads.length, count, path);
  }
});

test('a glance lists step leads only when every step has one', () => {
  const steps = '## Steps\n\n1. **Light it.** Then wait.\n2. **Feed it.** Small sticks first.\n';
  assert.deepEqual(stepLeads(steps), ['Light it.', 'Feed it.']);
  assert.equal(stepLeads('## Steps\n\n1. **Light it.** Then wait.\n2. Feed it.\n'), null);
  assert.equal(stepLeads('## Steps\n\nNo list here.\n'), null);

  const spark = guides.find((g) => g.path === 'content/en/fire/spark-fire.md');
  const leads = stepLeads(splitFieldCard(spark.body, spark.headings).front[1].markdown);
  assert.equal(leads.length, 9);
  assert.equal(leads[0], 'Get everything ready first.');
});

test('a guide without the three sections, or with them out of order, keeps its old page', () => {
  const headings = { need: 'You need', steps: 'Steps', watch: 'Watch out' };
  assert.equal(splitFieldCard('Intro.\n\n## Steps\n\n1. Go.\n', headings), null);
  assert.equal(
    splitFieldCard('## Watch out\n\n- Hot.\n\n## You need\n\n- Wood.\n\n## Steps\n\n1. Go.\n', headings),
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
  const html = numberSteps(
    '<ol>\n<li>One<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n</li>\n<li>Two<ol>\n<li>i</li>\n</ol>\n</li>\n</ol>\n'
  );
  assert.deepEqual([...html.matchAll(/id="step-(\d+)"/g)].map((m) => m[1]), ['1', '2']);
  assert.equal((html.match(/<li>/g) || []).length, 3);
});

test('every language carries the card words', () => {
  const keys = Object.keys(languages[0].strings.fieldCard).sort();
  for (const language of languages) {
    const words = language.strings.fieldCard;
    assert.deepEqual(Object.keys(words).sort(), keys, language.code);
    for (const key of ['needCount', 'stepsCount', 'watchCount']) assert.match(words[key], /\{n\}/u);
    for (const slot of ['{url}', '{language}', '{date}', '{evidence}'])
      assert.ok(words.colophon.includes(slot), `${language.code} colophon carries ${slot}`);
    for (const value of Object.values(words.headings)) assert.ok(value.trim(), language.code);
  }
});
