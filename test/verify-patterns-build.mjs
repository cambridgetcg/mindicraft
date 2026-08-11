import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { preparePatterns } from '../guide/patterns.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const GUIDE = join(ROOT, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const treeBytes = readFileSync(join(GUIDE, 'tree.json'));
const definitionBytes = readFileSync(join(GUIDE, 'patterns.mjs'));
const tree = JSON.parse(treeBytes);
const careSourceBytes = Object.fromEntries(
  [
    'share-work-fairly',
    'hold-a-council',
    'settle-disputes',
    'common-works',
    'plant-a-village',
  ].map((slug) => [
    slug,
    readFileSync(join(GUIDE, 'content', 'en', 'living-together', `${slug}.md`)),
  ])
);
const expected = preparePatterns(tree, {
  sourceBytes: treeBytes,
  careSourceBytes,
  definitionBytes,
});
const patterns = json(join(DIST, 'api', 'patterns.json'));
const page = read(join(DIST, 'patterns', 'index.html'));
const rootPage = read(join(DIST, 'index.html'));
const apiIndex = json(join(DIST, 'api', 'index.json'));
const client = read(join(DIST, 'mindicraft.mjs'));
const sitemap = read(join(DIST, 'sitemap.xml'));
const manifest = json(join(DIST, '.well-known', 'agent.json'));
const css = read(join(DIST, 'style.css'));

assert.deepEqual(
  patterns,
  expected,
  'the public projection must be derived exactly from the committed tree'
);
assert.equal(patterns.schema_version, 'mindicraft.patterns/1');
assert.equal(patterns.source.authoritative_api, '/api/tree.json');
assert.equal(patterns.village_path.target, 'plant-a-village');
assert.equal(patterns.boundaries.automatic_action, 'never');
assert.equal(patterns.boundaries.grants_authority, false);
assert.equal(patterns.boundaries.scores_beings, false);
assert.equal(patterns.boundaries.learning_state_included, false);
assert.equal(patterns.boundaries.application_tracking_added, false);
assert.equal(patterns.care_questions_provenance.path, 'guide/patterns.mjs');
assert.match(patterns.care_questions_provenance.sha256, /^[0-9a-f]{64}$/u);
for (const question of patterns.care_questions) {
  assert.match(question.source.sha256, /^[0-9a-f]{64}$/u);
  assert.match(question.source.path, new RegExp(`${question.guide}\\.md$`, 'u'));
}

assert.match(page, /<body class="patterns-body">/u);
assert.match(
  page,
  /<link rel="canonical" href="https:\/\/mindicraft\.com\/patterns\/">/u
);
assert.match(
  page,
  /<link rel="alternate" type="application\/json" href="https:\/\/mindicraft\.com\/api\/patterns\.json">/u
);
assert.match(page, /Love preserves standing\. Understanding makes a return path\./u);
assert.match(page, /a design test, not a description of every guide/u);
assert.match(page, /Some existing guides do not yet pass/u);
assert.match(page, /It adds no second guide graph/u);
assert.match(page, /All 50 direct domain joins in words/u);
assert.match(page, /The map is not the ground/u);
assert.match(page, /This interpretive page is in English for now/u);
assert.match(page, /role="region" tabindex="0"/u);
assert.match(page, /aria-hidden="true" focusable="false"/u);
assert.match(
  page,
  /class="pattern-map-canvas" style="--pattern-map-height:[0-9]+px"/u
);
assert.match(
  page,
  /https:\/\/cambridgetcg\.github\.io\/castle-gate\/love-and-understanding/u
);
const curves = [
  ...page.matchAll(
    /d="M ([0-9.]+) [0-9.]+ C ([0-9.]+) [0-9.]+, ([0-9.]+) [0-9.]+, ([0-9.]+) [0-9.]+"/gu
  ),
];
const drawnEdgeKeys = new Set([
  ...expected.backbone_domain_edges,
  ...expected.village_path.domain_edges,
].map(({ from, to }) => `${from}>${to}`));
assert.equal(curves.length, drawnEdgeKeys.size);
for (const [, start, firstControl, secondControl, end] of curves) {
  const values = [start, firstControl, secondControl, end].map(Number);
  assert.ok(
    values[0] <= values[1] && values[1] <= values[2] && values[2] <= values[3],
    `edge must not bend backward: ${values.join(' <= ')}`
  );
}

const domainCards = page.match(/class="pattern-domain(?: is-village-path)?"/gu) || [];
assert.equal(domainCards.length, expected.counts.domains);
const plainSection = page.match(
  /<section class="pattern-plain"[\s\S]*?<\/section>/u
)?.[0];
assert.ok(plainSection, 'the plain-language equivalent must exist');
assert.equal(
  (plainSection.match(/<li class="pattern-plain-domain">/gu) || []).length,
  expected.counts.domains
);
assert.equal(
  (plainSection.match(/<li><span aria-hidden="true">←<\/span>/gu) || []).length,
  expected.counts.cross_domain_pairs
);
assert.match(plainSection, /Readable backbone\./u);
assert.match(plainSection, /village reading path\./u);
assert.match(plainSection, /Direct join left out of the reduced drawing\./u);
for (const slug of [
  'share-work-fairly',
  'hold-a-council',
  'settle-disputes',
  'common-works',
  'plant-a-village',
]) {
  assert.match(page, new RegExp(`href="/en/living-together/${slug}/"`, 'u'));
}
for (const phrase of [
  'Standing check',
  'Understanding check',
  'Repair check',
  'Consent and exit check',
  'Inheritance check',
  'Keep separate:',
]) {
  assert.match(page, new RegExp(phrase, 'u'));
}
for (const forbidden of [
  /data-learning-/u,
  /learning-ui\.mjs/u,
  /<script\b/u,
  /<form\b/u,
  /<input\b/u,
  /<button\b/u,
]) {
  assert.doesNotMatch(page, forbidden);
}

assert.match(rootPage, /href="\/patterns\/"/u);
assert.match(rootPage, /The page holds an expectation\. Reality returns the result\./u);
for (const language of ['en', 'zh', 'yue', 'es']) {
  const home = read(join(DIST, language, 'index.html'));
  assert.match(home, /class="patterns-home-door" href="\/patterns\/"/u);
  assert.match(home, /How the pieces connect · English/u);
}
assert.match(apiIndex.endpoints.patterns, /derived 17-domain view/u);
assert.match(apiIndex.endpoints.patterns, /never a score of a person/u);
assert.match(apiIndex.humans, /\/patterns\//u);
assert.match(client, /export const patterns = \(\) => get\('\/api\/patterns\.json'\);/u);
assert.match(sitemap, /<loc>https:\/\/mindicraft\.com\/patterns\/<\/loc>/u);
assert.equal(manifest.resources.length, 8);
assert.equal(manifest.resources.some(({ id }) => id === 'patterns'), false);
assert.match(css, /\.pattern-map-scroll:focus-visible/u);
assert.match(
  css,
  /\.pattern-map-canvas \{[\s\S]*?height: var\(--pattern-map-height, 720px\);/u
);
assert.match(css, /\.pattern-edge \{[\s\S]*?opacity: 1;/u);
assert.match(css, /@media print[\s\S]*\.pattern-map-scroll/u);

console.log(
  `verified patterns: ${patterns.counts.domains} domains, ${patterns.counts.cross_domain_pairs} direct joins, ${patterns.counts.village_path_guides}-guide reading path, five care questions, plain equivalent, no score or action`
);
