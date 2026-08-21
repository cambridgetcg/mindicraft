import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { prepareCognition } from '../guide/cognition.mjs';
import { assertCognitionReview } from '../guide/cognition-review.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const GUIDE = join(ROOT, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const sourceBytes = readFileSync(join(GUIDE, 'cognition.json'));
const source = JSON.parse(sourceBytes);
const receipt = json(join(GUIDE, 'cognition-review.json'));
const expected = prepareCognition(source, { sourceBytes });
const reviewed = assertCognitionReview(receipt, sourceBytes);
const published = json(join(DIST, 'api', 'cognition', 'index.json'));
const page = read(join(DIST, 'cognition', 'index.html'));
const rootPage = read(join(DIST, 'index.html'));
const notFound = read(join(DIST, '404.html'));
const apiIndex = json(join(DIST, 'api', 'index.json'));
const client = read(join(DIST, 'mindicraft.mjs'));
const sitemap = read(join(DIST, 'sitemap.xml'));
const manifest = json(join(DIST, '.well-known', 'agent.json'));
const agentText = read(join(DIST, 'agent.txt'));
const llms = read(join(DIST, 'llms.txt'));
const agentsPage = read(join(DIST, 'agents', 'index.html'));
const css = read(join(DIST, 'style.css'));
const worker = read(join(DIST, '_worker.js'));

assert.deepEqual(
  published,
  expected,
  'the public cognition API must equal the strictly prepared reviewed source'
);
assert.equal(reviewed.edition_digest, published.edition_digest);
assert.equal(published.schema_version, 'mindicraft.cognition/1');
assert.deepEqual(published.counts, {
  dimensions: 9,
  scopes: 3,
  observations: 7,
  gaps: 9,
  sources: 8,
});
assert.equal(published.boundaries.aggregate_score, 'never');
assert.equal(published.boundaries.scores_beings, false);
assert.equal(published.boundaries.human_equivalence, 'task_bound_only');
assert.equal(published.boundaries.missing_means_zero, false);
assert.equal(published.boundaries.consciousness_inferred, false);
assert.equal(published.boundaries.authority_granted, false);
assert.equal(published.boundaries.learning_state_included, false);
assert.equal(published.boundaries.automatic_action, 'never');
assert.equal(published.boundaries.application_tracking_added, false);
assert.equal(published.boundaries.update_mode, 'manual_review_only');

assert.match(page, /<body class="cognition-body">/u);
assert.match(
  page,
  /<link rel="canonical" href="https:\/\/mindicraft\.com\/cognition\/">/u
);
assert.match(
  page,
  /<link rel="alternate" type="application\/json" href="https:\/\/mindicraft\.com\/api\/cognition\/index\.json">/u
);
assert.match(page, /Many abilities\. No single intelligence level\./u);
assert.match(page, /Equivalent here means equivalent only here\./u);
assert.match(page, /The civilisation is not one being and receives no score\./u);
assert.match(page, /Dimension × measured scope/u);
assert.match(page, /Not checked is not false, absent, refused, or incapable\./u);
assert.match(page, /No dimension pays for another/u);
assert.match(page, /role="region" tabindex="0"/u);
assert.equal(
  (page.match(/<tr>\s*<th scope="row">/gu) || []).length,
  published.counts.dimensions
);
assert.equal(
  (page.match(/class="cognition-observation"/gu) || []).length,
  published.counts.observations
);
assert.equal(
  (page.match(/<li id="gap-/gu) || []).length,
  published.counts.gaps
);
for (const observation of published.observations) {
  assert.match(page, new RegExp(`id="${observation.id}"`, 'u'));
  assert.ok(page.includes(observation.human_reference.comparison));
  assert.ok(page.includes(observation.human_reference.boundary));
  assert.ok(page.includes(observation.setup));
  assert.ok(page.includes(observation.limits));
}
for (const sourceRecord of published.sources) {
  assert.ok(page.includes(`href="${sourceRecord.url}"`));
}
for (const forbidden of [
  /data-learning-/u,
  /learning-ui\.mjs/u,
  /<script\b/u,
  /<form\b/u,
  /<input\b/u,
  /<button\b/u,
  /radar/iu,
]) {
  assert.doesNotMatch(page, forbidden);
}

assert.match(rootPage, /href="\/cognition\/"/u);
assert.match(notFound, /href="\/cognition\/"/u);
for (const language of ['en', 'zh', 'yue', 'es']) {
  const home = read(join(DIST, language, 'index.html'));
  assert.match(
    home,
    /class="patterns-home-door cognition-home-door" href="\/cognition\/"/u
  );
  assert.match(home, /AI cognition map · English/u);
}
assert.equal(apiIndex.counts.cognition_dimensions, 9);
assert.equal(apiIndex.counts.cognition_observations, 7);
assert.match(apiIndex.endpoints.cognition, /human comparisons stay bound/u);
assert.match(apiIndex.endpoints.cognition, /never one intelligence score/u);
assert.match(apiIndex.humans, /\/cognition\//u);
assert.match(apiIndex.rules, /never computes an intelligence score/u);
assert.match(
  client,
  /export const cognition = \(\) => get\('\/api\/cognition\/index\.json'\);/u
);
assert.match(sitemap, /<loc>https:\/\/mindicraft\.com\/cognition\/<\/loc>/u);
assert.equal(manifest.resources.length, 8);
assert.equal(manifest.resources.some(({ id }) => id === 'cognition'), false);
assert.equal(
  manifest.claims.some(({ id }) => id === 'cognition_read_only'),
  true
);
assert.match(agentText, /cognition: https:\/\/mindicraft\.com\/api\/cognition\/index\.json/u);
assert.match(llms, /AI cognition map keeps 7 dated observations across 9 separate dimensions/u);
assert.match(agentsPage, /Read the AI cognition map without flattening it/u);
assert.match(worker, /'\/cognition\/': \{ reps: \['text\/html', 'application\/json'\]/u);
assert.match(worker, /'\/api\/cognition\/index\.json': \{ reps: \['application\/json'\]/u);
assert.match(css, /\.cognition-map-scroll:focus-visible/u);
assert.match(css, /\.cognition-observation:target/u);
assert.match(css, /@media print[\s\S]*\.cognition-map table/u);

console.log(
  `verified cognition map: ${published.counts.dimensions} dimensions, ${published.counts.observations} dated observations, ${published.counts.gaps} explicit gaps, no aggregate score or learner state`
);
