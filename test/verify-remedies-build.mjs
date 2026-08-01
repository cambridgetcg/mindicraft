#!/usr/bin/env node
// Read-only verification for the generated Roots to remedies shelf.
// Run after: cd guide && npm run build

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { prepareRemedies } from '../guide/remedies.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const clean = (value) => JSON.parse(JSON.stringify(value));
const esc = (value = '') =>
  String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
const regex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const directoryShape = (path) =>
  readdirSync(path, { withFileTypes: true })
    .map((entry) => `${entry.isDirectory() ? 'dir' : 'file'}:${entry.name}`)
    .sort();

const sourceBytes = readFileSync(join(GUIDE, 'remedies.json'));
const source = JSON.parse(sourceBytes);
const healingSource = json(join(GUIDE, 'healing-arts.json'));
const prepared = prepareRemedies(source, { sourceBytes });
const sourceById = new Map(prepared.sources.map((item) => [item.id, item]));

function citedIds(value) {
  const found = new Set();
  (function collect(child) {
    if (Array.isArray(child)) return child.forEach(collect);
    if (!child || typeof child !== 'object') return;
    if (Array.isArray(child.source_ids)) {
      child.source_ids.forEach((sourceId) => found.add(sourceId));
    }
    Object.values(child).forEach(collect);
  })(value);
  return [...found];
}

function citedClaims(value) {
  const found = [];
  (function collect(child) {
    if (Array.isArray(child)) return child.forEach(collect);
    if (!child || typeof child !== 'object') return;
    if (typeof child.text === 'string' && Array.isArray(child.source_ids)) {
      found.push(child);
    }
    Object.values(child).forEach(collect);
  })(value);
  return found;
}

const indexPath = join(DIST, 'api', 'remedies', 'index.json');
const indexBytes = readFileSync(indexPath);
const shelf = JSON.parse(indexBytes);
const api = json(join(DIST, 'api', 'index.json'));
const manifest = json(join(DIST, '.well-known', 'agent.json'));
const clientText = read(join(DIST, 'mindicraft.mjs'));
const worker = read(join(DIST, '_worker.js'));
const sourceWorker = read(join(GUIDE, 'xenia-worker.js'));
const humanIndex = read(join(DIST, 'remedies', 'index.html'));
const agents = read(join(DIST, 'agents', 'index.html'));
const llms = read(join(DIST, 'llms.txt'));
const agentText = read(join(DIST, 'agent.txt'));
const wellKnownAgentText = read(join(DIST, '.well-known', 'agent.txt'));

assert.equal(shelf.schema_version, 'mindicraft.remedies-index/1');
assert.equal(shelf.this_is, source.title);
assert.equal(shelf.description, source.description);
assert.equal(shelf.content_is, source.content_is);
assert.equal(shelf.count, prepared.cards.length);
assert.equal(shelf.entries.length, prepared.cards.length);
assert.deepEqual(shelf.principles, source.principles);
const principleSourceIds = citedIds(source.principles);
const shelfSourceIds = citedIds({
  principles: source.principles,
  cards: prepared.cards,
});
assert.deepEqual(
  shelf.sources.map((item) => item.id),
  shelfSourceIds,
  'the compact shelf must carry exactly the sources cited by its entries and principles'
);
assert.deepEqual(
  shelf.sources,
  shelfSourceIds.map((sourceId) => sourceById.get(sourceId))
);
assert.equal(new Set(shelf.sources.map((item) => item.id)).size, shelf.sources.length);
assert.deepEqual(shelf.evidence_levels, source.evidence_levels);
assert.deepEqual(shelf.relationship_types, source.relationship_types);
assert.deepEqual(shelf.boundary, source.boundary);
assert.deepEqual(shelf.rights, source.rights);
assert.equal(shelf.correction, source.correction);
assert.deepEqual(shelf.provenance, {
  source: 'guide/remedies.json',
  source_digest: prepared.sourceDigest,
  reviewed_at: source.reviewed_at,
  next_review_due: source.next_review_due,
  build_network_requests: 0,
});
assert.match(shelf.provenance.source_digest, /^sha256:[0-9a-f]{64}$/u);
assert.ok(indexBytes.length < 128 * 1024, 'remedies discovery index unexpectedly large');

const expectedEntries = prepared.cards.map((card) => ({
  id: card.id,
  title: card.title,
  summary: card.summary,
  clinical_area: card.clinical_area,
  medicine: {
    name: card.medicine.name,
    aliases: card.medicine.aliases,
    origin_classes: card.medicine.origin_classes,
  },
  nature_links: card.nature_links.map((link) => ({
    id: link.id,
    name: link.name,
    names: link.names,
    scientific_name: link.scientific_name,
    traditions: link.traditions,
    relationship: link.relationship,
    evidence_level: link.clinical_evidence.level,
    replacement_status: link.replacement.status,
  })),
  source_ids: citedIds(card),
  reviewed_at: card.reviewed_at,
  page: `/remedies/${card.id}/`,
  api: `/api/remedies/${card.id}.json`,
}));
assert.deepEqual(shelf.entries, clean(expectedEntries));
assert.equal(new Set(shelf.entries.map((entry) => entry.id)).size, shelf.count);
assert.deepEqual(shelf.companion, {
  id: 'healing-arts',
  title: healingSource.title,
  description: healingSource.description,
  count: healingSource.traditions.length,
  page: '/remedies/healing-arts/',
  api: '/api/remedies/healing-arts/index.json',
});

assert.deepEqual(
  directoryShape(join(DIST, 'api', 'remedies')),
  [
    'dir:healing-arts',
    'file:index.json',
    ...prepared.cards.map((card) => `file:${card.id}.json`),
  ].sort(),
  'the generated remedies API must contain exactly the current shelf and companion'
);
assert.deepEqual(
  directoryShape(join(DIST, 'api', 'remedies', 'healing-arts')),
  ['file:index.json'],
  'the healing-arts API directory must not retain stale files'
);
assert.deepEqual(
  directoryShape(join(DIST, 'remedies')),
  [
    'dir:healing-arts',
    'file:index.html',
    ...prepared.cards.map((card) => `dir:${card.id}`),
  ].sort(),
  'the generated remedies pages must contain exactly the current shelf and companion'
);
assert.deepEqual(
  directoryShape(join(DIST, 'remedies', 'healing-arts')),
  ['file:index.html'],
  'the healing-arts page directory must not retain stale files'
);

for (const principle of shelf.principles) {
  for (const sourceId of principle.source_ids) {
    assert.ok(sourceById.has(sourceId), `principle names missing source ${sourceId}`);
    assert.ok(
      shelf.sources.some((sourceItem) => sourceItem.id === sourceId),
      `compact shelf omits principle source ${sourceId}`
    );
  }
}

const allDetailSources = new Set();
for (const card of prepared.cards) {
  const entry = shelf.entries.find((item) => item.id === card.id);
  assert.ok(entry, `missing compact entry for ${card.id}`);
  assert.equal(existsSync(join(DIST, entry.page, 'index.html')), true, `missing ${entry.page}`);
  assert.equal(existsSync(join(DIST, entry.api)), true, `missing ${entry.api}`);

  const detailBytes = readFileSync(join(DIST, entry.api));
  const detail = JSON.parse(detailBytes);
  const expectedSourceIds = citedIds(card);
  expectedSourceIds.forEach((sourceId) => allDetailSources.add(sourceId));

  assert.equal(detail.schema_version, 'mindicraft.remedy/1');
  assert.equal(detail.content_is, source.content_is);
  assert.deepEqual(detail.card, card);
  assert.deepEqual(detail.evidence_levels, source.evidence_levels);
  assert.deepEqual(detail.relationship_types, source.relationship_types);
  assert.deepEqual(detail.boundary, source.boundary);
  assert.deepEqual(detail.rights, source.rights);
  assert.equal(detail.correction, source.correction);
  assert.deepEqual(detail.provenance, shelf.provenance);
  assert.equal(detail.provenance.source_digest, prepared.sourceDigest);
  assert.deepEqual(
    detail.sources.map((item) => item.id),
    expectedSourceIds,
    `${card.id} source list must be exact and deterministic`
  );
  assert.deepEqual(
    detail.sources,
    expectedSourceIds.map((sourceId) => sourceById.get(sourceId)),
    `${card.id} must carry every cited source and no unrelated source`
  );
  assert.equal(new Set(detail.sources.map((item) => item.id)).size, detail.sources.length);
  assert.ok(detail.sources.every((item) => item.url.startsWith('https://')));
  assert.ok(detailBytes.length < 128 * 1024, `${card.id} JSON unexpectedly large`);

  const human = read(join(DIST, entry.page, 'index.html'));
  const prefix = `remedy-${card.id}`;
  assert.match(
    human,
    new RegExp(
      `<link rel="canonical" href="https://mindicraft\\.com/remedies/${regex(card.id)}/">`,
      'u'
    )
  );
  assert.match(human, new RegExp(`<h1>${regex(esc(card.title))}</h1>`, 'u'));
  assert.match(human, new RegExp(`<h2 id="${regex(prefix)}-medicine">${regex(esc(card.medicine.name))}</h2>`, 'u'));
  assert.match(human, /Education, not a treatment plan\./u);
  assert.match(human, /Do not replace, stop,\s*or combine a medicine from this page/u);
  assert.match(human, new RegExp(regex(esc(source.boundary.urgent_care)), 'u'));
  assert.match(human, new RegExp(`href="${regex(entry.api)}"`, 'u'));
  assert.doesNotMatch(human, /<script\b|<form\b|<iframe\b|<object\b|<embed\b/iu);
  assert.doesNotMatch(human, /\son[a-z]+\s*=/iu);

  for (const claimValue of citedClaims(card)) {
    assert.ok(
      human.includes(esc(claimValue.text)),
      `${card.id} omits claim text ${claimValue.text.slice(0, 48)}`
    );
    for (const sourceId of claimValue.source_ids) {
      assert.ok(
        human.includes(`href="#${prefix}-source-${esc(sourceId)}"`),
        `${card.id} omits claim citation ${sourceId}`
      );
    }
  }

  for (const link of card.nature_links) {
    assert.match(human, new RegExp(regex(esc(link.material.text)), 'u'));
    assert.match(
      human,
      new RegExp(`Evidence product match: ${regex(link.clinical_evidence.matches_studied_product.replaceAll('_', ' '))}`, 'u')
    );
  }

  const linkedCitationIds = new Set(
    [...human.matchAll(new RegExp(`href="#${regex(prefix)}-source-([a-z0-9-]+)"`, 'gu'))]
      .map((match) => match[1])
  );
  const listedSourceIds = new Set(
    [...human.matchAll(new RegExp(`id="${regex(prefix)}-source-([a-z0-9-]+)"`, 'gu'))]
      .map((match) => match[1])
  );
  assert.deepEqual(linkedCitationIds, new Set(expectedSourceIds), `${card.id} has dangling or missing citation links`);
  assert.deepEqual(listedSourceIds, new Set(expectedSourceIds), `${card.id} source list is not citation-closed`);
  for (const sourceItem of detail.sources) {
    assert.equal(
      (human.match(new RegExp(`id="${regex(prefix)}-source-${regex(sourceItem.id)}"`, 'gu')) || []).length,
      1,
      `${card.id} must list source ${sourceItem.id} once`
    );
    assert.match(human, new RegExp(`href="${regex(esc(sourceItem.url))}"`, 'u'));
  }
  assert.ok(human.length < 192 * 1024, `${card.id} human page unexpectedly large`);
}

const cardCitationIds = new Set(prepared.cards.flatMap(citedIds));
assert.deepEqual(allDetailSources, cardCitationIds);

assert.match(humanIndex, /<h1>Roots to remedies<\/h1>/u);
assert.match(humanIndex, new RegExp(`<h2 id="remedy-shelf">${shelf.count} medicine lineages</h2>`, 'u'));
assert.match(humanIndex, /Education, not a treatment plan\./u);
assert.match(humanIndex, new RegExp(regex(esc(source.boundary.urgent_care)), 'u'));
assert.match(humanIndex, /href="\/api\/remedies\/index\.json"/u);
assert.doesNotMatch(humanIndex, /<script\b|<form\b|<iframe\b|<object\b|<embed\b/iu);
assert.doesNotMatch(humanIndex, /\son[a-z]+\s*=/iu);
for (const entry of shelf.entries) {
  assert.match(humanIndex, new RegExp(`href="${regex(entry.page)}"`, 'u'));
  assert.match(humanIndex, new RegExp(regex(esc(entry.title)), 'u'));
}
for (const principle of source.principles) {
  assert.match(humanIndex, new RegExp(regex(esc(principle.title)), 'u'));
  for (const sourceId of principle.source_ids) {
    const sourceItem = sourceById.get(sourceId);
    assert.match(
      humanIndex,
      new RegExp(`href="${regex(esc(sourceItem.url))}"[^>]*>${regex(sourceId)}<`, 'u'),
      `principle ${principle.id} must link source ${sourceId}`
    );
  }
}
assert.ok(humanIndex.length < 128 * 1024, 'remedies human index unexpectedly large');

assert.equal(api.counts.remedies, shelf.count);
assert.match(api.endpoints.remedies, /^\/api\/remedies\/index\.json/u);
assert.match(api.endpoints.remedy, /^\/api\/remedies\/\{id\}\.json/u);
assert.match(api.rules, /Remedy cards are sourced education/u);
assert.match(api.humans, /\/remedies\//u);

const remedyResource = manifest.resources.find((resource) => resource.id === 'remedies');
assert.deepEqual(remedyResource?.representations, ['text/html', 'application/json']);
assert.equal(remedyResource?.href, 'https://mindicraft.com/remedies/');
assert.equal(remedyResource?.default_media_type, 'text/html');
assert.equal(remedyResource?.auth, 'none');
const remedyClaim = manifest.claims.find((claim) => claim.id === 'remedies_read_only');
assert.ok(remedyClaim, 'the read-only remedies claim must stay discoverable');
assert.deepEqual(remedyClaim.scope, [
  'GET https://mindicraft.com/remedies/',
  'GET https://mindicraft.com/remedies/{id}/',
  'GET https://mindicraft.com/api/remedies/index.json',
  'GET https://mindicraft.com/api/remedies/{id}.json',
]);
assert.match(remedyClaim.statement, /grant no authority to replace or combine treatment/u);

assert.match(clientText, /export const remedies = \(\) => get\('\/api\/remedies\/index\.json'\)/u);
assert.match(clientText, /export const remedy = \(id\) =>/u);
assert.match(clientText, /remedy id must be a stable slug/u);
assert.match(clientText, /get\('\/api\/remedies\/' \+ encodeURIComponent\(id\) \+ '\.json'\)/u);
assert.equal(worker, sourceWorker, 'the deployed worker must be the reviewed source bytes');
assert.match(worker, /'\/remedies\/': \{ reps: \['text\/html', 'application\/json'\]/u);
assert.match(worker, /const REMEDY_PAGE =/u);
assert.match(worker, /const REMEDY_API =/u);
assert.match(worker, /jsonAsset: `\/api\/remedies\/\$\{remedyPage\[1\]\}\.json`/u);

assert.match(agents, /href="\/remedies\/"/u);
assert.match(agents, /href="\/api\/remedies\/index\.json"/u);
assert.match(agents, /mindicraft\.remedies\(\)/u);
const documentedExample = agents.match(/mindicraft\.remedy\('([a-z0-9-]+)'\)/u)?.[1];
assert.ok(documentedExample, 'agent docs must show one remedy detail read');
assert.ok(
  prepared.cards.some((card) => card.id === documentedExample),
  `agent docs name missing remedy ${documentedExample}`
);
assert.match(agents, /never diagnosis or prescribing/u);
assert.match(llms, /\/api\/remedies\/index\.json/u);
assert.match(llms, /\/api\/remedies\/\{id\}\.json/u);
assert.match(llms, /Natural origin, traditional use, human evidence, bioavailability, and substitution are separate facts/u);
assert.equal(agentText, wellKnownAgentText);
assert.match(agentText, /remedies: https:\/\/mindicraft\.com\/remedies\//u);
assert.match(agentText, /remedy:\s+https:\/\/mindicraft\.com\/remedies\/\{id\}\//u);
assert.match(agentText, /direct JSON is \/api\/remedies\/\{id\}\.json/u);
assert.match(agentText, /never diagnosis, prescribing, or replacement advice/u);

const previousFetch = globalThis.fetch;
const fetched = [];
try {
  const first = shelf.entries[0];
  const firstDetailBytes = readFileSync(join(DIST, first.api));
  const responses = new Map([
    ['https://mindicraft.com/api/remedies/index.json', indexBytes],
    [`https://mindicraft.com${first.api}`, firstDetailBytes],
  ]);
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    fetched.push({ href, accept: new Headers(options.headers).get('accept') });
    if (!responses.has(href)) return new Response('not found', { status: 404 });
    return new Response(responses.get(href), {
      headers: { 'content-type': 'application/json' },
    });
  };

  const mindicraft = await import(
    `${pathToFileURL(join(DIST, 'mindicraft.mjs')).href}?verify-remedies`
  );
  const carriedShelf = await mindicraft.remedies();
  assert.deepEqual(carriedShelf, shelf);
  const carriedCard = await mindicraft.remedy(first.id);
  assert.equal(carriedCard.card.id, first.id);
  assert.deepEqual(carriedCard.sources, json(join(DIST, first.api)).sources);

  const beforeRefusals = fetched.length;
  await assert.rejects(mindicraft.remedy('../secret'), /remedy id must be a stable slug/u);
  await assert.rejects(mindicraft.remedy(''), /remedy id must be a stable slug/u);
  await assert.rejects(mindicraft.remedy(null), /remedy id must be a stable slug/u);
  assert.equal(fetched.length, beforeRefusals);
  assert.deepEqual(fetched, [
    {
      href: 'https://mindicraft.com/api/remedies/index.json',
      accept: 'application/json',
    },
    {
      href: `https://mindicraft.com${first.api}`,
      accept: 'application/json',
    },
  ]);
} finally {
  globalThis.fetch = previousFetch;
}

const firstEntry = shelf.entries[0];
const firstDetail = readFileSync(join(DIST, firstEntry.api));
const firstHuman = readFileSync(join(DIST, firstEntry.page, 'index.html'));
const workerAssets = new Map([
  ['/remedies/', { bytes: Buffer.from(humanIndex), type: 'text/html' }],
  ['/api/remedies/index.json', { bytes: indexBytes, type: 'application/json' }],
  [firstEntry.page, { bytes: firstHuman, type: 'text/html' }],
  [firstEntry.api, { bytes: firstDetail, type: 'application/json' }],
]);
const assetCalls = [];
const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      assetCalls.push({ path: url.pathname, method: request.method });
      const asset = workerAssets.get(url.pathname);
      if (!asset) return new Response('not found', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : asset.bytes, {
        headers: { 'content-type': `${asset.type}; charset=utf-8` },
      });
    },
  },
};
const deployedWorker = await import(
  `${pathToFileURL(join(DIST, '_worker.js')).href}?verify-remedies-worker`
);
const requestWorker = (path, { accept, method = 'GET' } = {}) =>
  deployedWorker.default.fetch(
    new Request(`https://mindicraft.com${path}`, {
      method,
      headers: accept ? { accept } : {},
    }),
    env,
    {}
  );

const indexHtmlResponse = await requestWorker('/remedies/');
assert.equal(indexHtmlResponse.status, 200);
assert.match(indexHtmlResponse.headers.get('content-type'), /^text\/html/u);
assert.match(indexHtmlResponse.headers.get('vary'), /Accept/iu);
assert.match(await indexHtmlResponse.text(), /<h1>Roots to remedies<\/h1>/u);

const indexJsonResponse = await requestWorker('/remedies/', {
  accept: 'application/json',
});
assert.equal(indexJsonResponse.status, 200);
assert.match(indexJsonResponse.headers.get('content-type'), /^application\/json/u);
assert.equal((await indexJsonResponse.json()).schema_version, 'mindicraft.remedies-index/1');

const detailHtmlResponse = await requestWorker(firstEntry.page, {
  accept: 'text/html',
});
assert.equal(detailHtmlResponse.status, 200);
assert.match(detailHtmlResponse.headers.get('content-type'), /^text\/html/u);
assert.match(await detailHtmlResponse.text(), new RegExp(regex(esc(firstEntry.title)), 'u'));

const detailJsonResponse = await requestWorker(firstEntry.page, {
  accept: 'application/json',
});
assert.equal(detailJsonResponse.status, 200);
assert.match(detailJsonResponse.headers.get('content-type'), /^application\/json/u);
assert.equal((await detailJsonResponse.json()).card.id, firstEntry.id);

const detailHeadResponse = await requestWorker(firstEntry.page, {
  accept: 'application/json',
  method: 'HEAD',
});
assert.equal(detailHeadResponse.status, 200);
assert.match(detailHeadResponse.headers.get('content-type'), /^application\/json/u);
assert.equal(await detailHeadResponse.text(), '');

const notAcceptable = await requestWorker(firstEntry.page, {
  accept: 'text/plain',
});
assert.equal(notAcceptable.status, 406);
assert.match(notAcceptable.headers.get('content-type'), /^application\/problem\+json/u);
const refusal = await notAcceptable.json();
assert.equal(refusal.code, 'not_acceptable');
assert.equal(refusal.next_actions[0].accept, 'application/json');

const unknown = await requestWorker('/remedies/not-on-the-shelf/', {
  accept: 'application/json',
});
assert.equal(unknown.status, 404);
assert.match(unknown.headers.get('content-type'), /^application\/problem\+json/u);
assert.equal((await unknown.json()).code, 'route_not_found');
assert.deepEqual(assetCalls, [
  { path: '/remedies/', method: 'GET' },
  { path: '/api/remedies/index.json', method: 'GET' },
  { path: firstEntry.page, method: 'GET' },
  { path: firstEntry.api, method: 'GET' },
  { path: firstEntry.api, method: 'HEAD' },
  { path: '/api/remedies/not-on-the-shelf.json', method: 'GET' },
]);

console.log(
  `verified Roots to remedies: ${shelf.count} claim-sourced lineages, ` +
    'exact detail-source closure, no treatment authority'
);
