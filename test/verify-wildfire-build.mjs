import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const DIST = join(GUIDE, 'dist');
const sourceBytes = readFileSync(join(GUIDE, 'wildfire.json'));
const source = JSON.parse(sourceBytes);
const receipt = JSON.parse(readFileSync(join(GUIDE, 'wildfire-review.json')));
const api = JSON.parse(readFileSync(join(DIST, 'api', 'wildfire', 'index.json')));
const html = readFileSync(join(DIST, 'wildfire', 'index.html'), 'utf8');
const leaveNow = readFileSync(join(DIST, 'wildfire', 'leave-now.txt'), 'utf8');
const quick = readFileSync(join(DIST, 'wildfire', 'quick.txt'), 'utf8');
const root = readFileSync(join(DIST, 'index.html'), 'utf8');
const style = readFileSync(join(DIST, 'style.css'), 'utf8');
const apiIndex = JSON.parse(readFileSync(join(DIST, 'api', 'index.json')));
const client = readFileSync(join(DIST, 'mindicraft.mjs'), 'utf8');
const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
const agents = readFileSync(join(DIST, 'agents', 'index.html'), 'utf8');
const agentTxt = readFileSync(join(DIST, 'agent.txt'), 'utf8');
const langs = JSON.parse(readFileSync(join(GUIDE, 'langs.json'))).languages;
const digest = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;

assert.equal(api.schema_version, 'mindicraft.wildfire-api/1');
assert.deepEqual(
  Object.keys(api).sort(),
  ['schema_version', 'edition', 'counts', 'links', 'provenance'].sort()
);
assert.deepEqual(api.edition, source);
assert.equal(api.provenance.source_digest, digest);
assert.equal(receipt.sources['wildfire.json'], digest);
assert.equal(api.edition.reviewed_at, source.reviewed_at);
assert.equal(api.edition.next_review_due, source.next_review_due);
assert.deepEqual(api.counts, {
  paths: 6,
  support_needs: 6,
  regions: 7,
  sources: 42,
});
assert.deepEqual(api.edition.paths.map(({ id }) => id), source.paths.map(({ id }) => id));
assert.deepEqual(api.edition.regions.map(({ id }) => id), source.regions.map(({ id }) => id));
assert.deepEqual(api.links, {
  human: '/wildfire/',
  leave_now_text: '/wildfire/leave-now.txt',
  full_offline_text: '/wildfire/quick.txt',
  correction: source.correction,
});

assert.match(html, /<link rel="canonical" href="https:\/\/mindicraft\.com\/wildfire\/">/u);
assert.match(html, /<meta name="description" content="A reviewed, printable wildfire/u);
assert.match(html, /Leave now\. Do not finish this page\./u);
assert.ok(
  html.indexOf('class="wildfire-now"') < html.indexOf('class="wildfire-hero"'),
  'the urgent action must precede title and care copy on small screens'
);
assert.match(html, /<h1 id="wildfire-now-title">Leave now/u);
assert.match(html, /this page replaces the general lost-person stay-put and signal-fire advice/u);
assert.match(html, /Current instructions from local fire, police, emergency management/u);
assert.match(html, /does not request a precise location, infer or transmit your location/u);
assert.match(html, /Return only after local authorities reopen the area/u);
assert.match(html, /href="\/wildfire\/quick\.txt"/u);
assert.match(html, /href="\/wildfire\/leave-now\.txt"/u);
assert.match(html, /href="\/api\/wildfire\/index\.json"/u);
assert.match(html, new RegExp(digest, 'u'));
for (const path of source.paths) {
  assert.match(html, new RegExp(`id="${path.id}"`, 'u'), path.id);
}
for (const sourceRecord of source.sources) {
  assert.match(html, new RegExp(`href="${sourceRecord.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'u'), sourceRecord.id);
  assert.match(quick, new RegExp(sourceRecord.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), sourceRecord.id);
}

for (const forbidden of [
  /<script\b/iu,
  /<form\b/iu,
  /<input\b/iu,
  /<textarea\b/iu,
  /<(?:iframe|img|video|audio|object|embed)\b/iu,
  /<link\b[^>]*rel="(?:preload|prefetch|preconnect|dns-prefetch)"/iu,
  /data-learning-page=/iu,
  /learning-ui\.mjs/iu,
  /marginbox/iu,
  /localStorage/iu,
  /sessionStorage/iu,
  /navigator\.geolocation/iu,
  /\bfetch\s*\(/iu,
  /set(?:Timeout|Interval)\s*\(/iu,
  /analytics|tracking-pixel/iu,
]) {
  assert.doesNotMatch(html, forbidden, String(forbidden));
}

assert.match(quick, /IMPORTANT BOUNDARY/u);
assert.match(quick, /This is a static guide/u);
assert.match(quick, /local fire, police, emergency management/u);
assert.match(quick, /replaces the\ngeneral lost-person stay-put and signal-fire advice/u);
assert.match(quick, /https:\/\/mindicraft\.com\/wildfire\//u);
assert.match(quick, new RegExp(digest, 'u'));
assert.ok(Buffer.byteLength(leaveNow) < 6000, 'leave-now card must remain small');
assert.match(leaveNow, /^WILDFIRE — LEAVE NOW/u);
assert.match(leaveNow, /Do not stop to collect belongings or fight the fire/u);
assert.match(leaveNow, /Mindicraft does not know live conditions/u);
for (const region of source.regions.filter(({ id }) => id !== 'global')) {
  assert.match(leaveNow, new RegExp(region.title, 'u'), region.id);
}

const firstScript = root.indexOf('<script>');
const rootDoor = root.indexOf('class="wildfire-entry"');
assert.ok(rootDoor >= 0 && rootDoor < firstScript, 'wildfire door must be visible before root script');
assert.match(root, /class="wildfire-entry" href="\/wildfire\/"/u);
assert.match(root, /buf\.endsWith\('wildfire'\)\)open\('\/wildfire\/'\)/u);
for (const lang of langs) {
  const home = readFileSync(join(DIST, lang.code, 'index.html'), 'utf8');
  assert.match(home, /class="wildfire-home-door"/u, lang.code);
  assert.match(home, /href="\/wildfire\/"/u, lang.code);
  assert.match(home, /Wildfire help · English/u, lang.code);
  const lostGuide = readFileSync(
    join(DIST, lang.code, 'begin', 'get-found', 'index.html'),
    'utf8'
  );
  assert.match(lostGuide, /href="\/wildfire\/"/u, `${lang.code} lost-person warning`);
  assert.ok(
    lostGuide.indexOf('href="/wildfire/"') < lostGuide.indexOf('<h2>'),
    `${lang.code} wildfire exception must precede stay-put instructions`
  );
}

assert.equal(apiIndex.counts.wildfire_paths, 6);
assert.equal(apiIndex.counts.wildfire_regions, 7);
assert.equal(apiIndex.counts.wildfire_sources, 42);
assert.match(apiIndex.endpoints.wildfire, /\/api\/wildfire\/index\.json/u);
assert.match(apiIndex.rules, /current local authorities override it/u);
assert.match(client, /export const wildfire = \(\) => get\('\/api\/wildfire\/index\.json'\)/u);
for (const discovery of [llms, agents, agentTxt]) {
  assert.match(discovery, /api\/wildfire\/index\.json/u);
  assert.match(discovery, /static/u);
}

assert.match(style, /\/\* Wildfire help/u);
assert.match(style, /@media print/u);
assert.match(style, /wildfire-region:not\(\[open\]\)/u);
assert.match(style, /min-height: 3\.1rem/u);

console.log(
  `verified wildfire help: ${api.counts.paths} paths, ${api.counts.regions} regional routers, ${api.counts.sources} sources, exact reviewed bytes`
);
