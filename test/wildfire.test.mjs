import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { prepareWildfireHelp } from '../guide/wildfire.mjs';

const sourceBytes = readFileSync(new URL('../guide/wildfire.json', import.meta.url));
const source = JSON.parse(sourceBytes);
const TODAY = source.reviewed_at;
const copy = () => structuredClone(source);
const bytesFor = (value) => Buffer.from(JSON.stringify(value));
const prepare = (value = copy(), bytes = bytesFor(value)) =>
  prepareWildfireHelp(value, { sourceBytes: bytes, today: TODAY });

function assertFrozenTree(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertFrozenTree(child, seen);
}

test('the committed wildfire source produces the small frozen build contract', () => {
  const prepared = prepareWildfireHelp(source, { sourceBytes, today: TODAY });

  assert.notEqual(prepared.source, source);
  assert.deepEqual(prepared.source, source);
  assert.deepEqual(prepared.counts, {
    paths: 6,
    support_needs: 6,
    regions: 7,
    sources: 42,
  });
  assert.deepEqual(prepared.freshness, {
    today: TODAY,
    reviewed_at: source.reviewed_at,
    next_review_due: source.next_review_due,
    current: true,
  });
  assert.equal(
    prepared.sourceDigest,
    'sha256:' + createHash('sha256').update(sourceBytes).digest('hex')
  );
  assert.match(prepared.sourceDigest, /^sha256:[0-9a-f]{64}$/u);
  assertFrozenTree(prepared);
});

test('the returned source is a defensive copy and cannot be changed through the input', () => {
  const value = copy();
  const prepared = prepare(value);
  const originalTitle = prepared.source.title;

  value.title = 'Changed outside the validator';
  value.paths[0].steps[0].text = 'Changed outside the validator';

  assert.equal(prepared.source.title, originalTitle);
  assert.notEqual(prepared.source.paths[0].steps[0].text, value.paths[0].steps[0].text);
  assert.throws(() => {
    prepared.source.title = 'Cannot write';
  }, TypeError);
  assert.throws(() => {
    prepared.counts.paths = 99;
  }, TypeError);
});

test('source bytes are explicit, valid UTF-8 JSON, structurally joined, and exactly digested', () => {
  assert.throws(
    () => prepareWildfireHelp(copy()),
    /options must be an object/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), { today: TODAY }),
    /options is missing sourceBytes/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), { sourceBytes: { text: '{}' }, today: TODAY }),
    /sourceBytes must be a string or byte array/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), {
      sourceBytes: Uint8Array.from([0xc3, 0x28]),
      today: TODAY,
    }),
    /valid UTF-8/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), { sourceBytes: Buffer.from('{{'), today: TODAY }),
    /must contain JSON/u
  );

  const changedObject = copy();
  changedObject.title = 'A different object';
  assert.throws(
    () => prepareWildfireHelp(changedObject, { sourceBytes, today: TODAY }),
    /source must exactly match sourceBytes/u
  );

  const withWhitespace = Buffer.concat([sourceBytes, Buffer.from(' ')]);
  const prepared = prepareWildfireHelp(source, {
    sourceBytes: withWhitespace,
    today: TODAY,
  });
  assert.notEqual(
    prepared.sourceDigest,
    prepareWildfireHelp(source, { sourceBytes, today: TODAY }).sourceDigest
  );
});

test('the schema is closed and unsafe fields or active markup fail before publication', () => {
  const rootField = copy();
  rootField.confidence = 'high';
  assert.throws(() => prepare(rootField), /unknown field confidence/u);

  const nestedField = copy();
  nestedField.paths[0].steps[0].confidence = 'high';
  assert.throws(() => prepare(nestedField), /unknown field confidence/u);

  const unsafeField = copy();
  unsafeField.paths[0].steps[0].html = 'ordinary text';
  assert.throws(() => prepare(unsafeField), /unsafe field html/u);

  const eventField = copy();
  eventField.care.onload = 'run something';
  assert.throws(() => prepare(eventField), /unsafe field onload/u);

  const markup = copy();
  markup.care.message = '<img src=x onerror=alert(1)>';
  assert.throws(() => prepare(markup), /active HTML/u);

  const activeUri = copy();
  activeUri.care.message = 'data:text/html,active-content';
  assert.throws(() => prepare(activeUri), /active URI/u);
});

test('review, next-review, and source-observation dates are explicit and bounded', () => {
  assert.throws(
    () => prepareWildfireHelp(copy(), { sourceBytes }),
    /options is missing today/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), {
      sourceBytes,
      today: '2026-02-30',
    }),
    /options\.today must be a real calendar date/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), {
      sourceBytes,
      today: '2026-08-02',
    }),
    /must not be before source\.reviewed_at/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), {
      sourceBytes,
      today: '2026-09-04',
    }),
    /review is overdue/u
  );
  assert.throws(
    () => prepareWildfireHelp(copy(), {
      sourceBytes,
      today: TODAY,
      timezone: 'UTC',
    }),
    /options has unknown field timezone/u
  );

  const impossible = copy();
  impossible.reviewed_at = '2026-02-30';
  assert.throws(() => prepare(impossible), /real calendar date/u);

  const noWindow = copy();
  noWindow.next_review_due = noWindow.reviewed_at;
  assert.throws(() => prepare(noWindow), /must follow review within 62 days/u);

  const longWindow = copy();
  longWindow.next_review_due = '2026-12-31';
  assert.throws(() => prepare(longWindow), /must follow review within 62 days/u);

  const futureObservation = copy();
  futureObservation.sources[0].observed_at = '2026-08-04';
  assert.throws(() => prepare(futureObservation), /observed after the guide review/u);

  const staleObservation = copy();
  staleObservation.sources[0].observed_at = '2026-07-02';
  assert.throws(() => prepare(staleObservation), /within 31 days of review/u);
});

test('the finite path and region progression remains complete and ordered', () => {
  const pathOrder = copy();
  [pathOrder.paths[0], pathOrder.paths[1]] = [pathOrder.paths[1], pathOrder.paths[0]];
  assert.throws(() => prepare(pathOrder), /source\.paths must remain in this order/u);

  const missingPath = copy();
  missingPath.paths.pop();
  assert.throws(() => prepare(missingPath), /must contain 6-6 items/u);

  const stepOrder = copy();
  [stepOrder.paths[0].steps[0], stepOrder.paths[0].steps[1]] = [
    stepOrder.paths[0].steps[1],
    stepOrder.paths[0].steps[0],
  ];
  assert.throws(() => prepare(stepOrder), /source\.paths\[0\]\.steps must remain/u);

  const regionOrder = copy();
  [regionOrder.regions[1], regionOrder.regions[2]] = [
    regionOrder.regions[2],
    regionOrder.regions[1],
  ];
  assert.throws(() => prepare(regionOrder), /source\.regions must remain in this order/u);

  const missingRegion = copy();
  missingRegion.regions.pop();
  assert.throws(() => prepare(missingRegion), /must contain 7-7 items/u);
});

test('lists, text, tree depth, node count, and source bytes have finite bounds', () => {
  const noNeeds = copy();
  noNeeds.support_needs = [];
  assert.throws(() => prepare(noNeeds), /must contain 1-16 items/u);

  const noLinks = copy();
  noLinks.regions[0].links = [];
  assert.throws(() => prepare(noLinks), /must contain 1-12 items/u);

  const longText = copy();
  longText.paths[0].steps[0].text = 'x'.repeat(361);
  assert.throws(() => prepare(longText), /1-360 characters/u);

  const deep = copy();
  let cursor = deep.care;
  for (let index = 0; index < 40; index += 1) {
    cursor.extra = {};
    cursor = cursor.extra;
  }
  assert.throws(() => prepare(deep), /exceeds depth 32/u);

  const manyNodes = copy();
  manyNodes.care.extra = Array.from({ length: 8192 }, () => null);
  assert.throws(() => prepare(manyNodes), /exceeds 8192 data nodes/u);

  assert.throws(
    () =>
      prepareWildfireHelp(copy(), {
        sourceBytes: ' '.repeat(128 * 1024 + 1),
        today: TODAY,
      }),
    /sourceBytes must contain 2-131072 bytes/u
  );
});

test('source references are closed, unique, region-correct, and every source is used', () => {
  const missing = copy();
  missing.paths[0].steps[0].source_ids[0] = 'missing-source';
  assert.throws(() => prepare(missing), /names missing source missing-source/u);

  const duplicateReference = copy();
  duplicateReference.paths[0].steps[0].source_ids = [
    duplicateReference.paths[0].steps[0].source_ids[0],
    duplicateReference.paths[0].steps[0].source_ids[0],
  ];
  assert.throws(() => prepare(duplicateReference), /contains duplicates/u);

  const duplicateSource = copy();
  duplicateSource.sources.push(structuredClone(duplicateSource.sources[0]));
  assert.throws(() => prepare(duplicateSource), /source\.sources contains duplicates/u);

  const unused = copy();
  unused.sources.push({
    ...structuredClone(unused.sources[0]),
    id: 'unused-source',
  });
  assert.throws(() => prepare(unused), /source unused-source is never cited/u);

  const wrongRegion = copy();
  wrongRegion.regions[0].links[0].source_id = 'ready-wildfires';
  assert.throws(() => prepare(wrongRegion), /must name a source for global or global/u);
});

test('source URLs use reviewed HTTPS authorities with matching publishers and kinds', () => {
  const insecure = copy();
  insecure.sources[0].url = insecure.sources[0].url.replace('https:', 'http:');
  assert.throws(() => prepare(insecure), /clean HTTPS source URL/u);

  const falseAuthority = copy();
  falseAuthority.sources[0].url = 'https://example.com/wildfires';
  assert.throws(() => prepare(falseAuthority), /not a reviewed source authority/u);

  const credentials = copy();
  credentials.sources[0].url = 'https://person:secret@www.ready.gov/wildfires';
  assert.throws(() => prepare(credentials), /clean HTTPS source URL/u);

  const unreviewedQuery = copy();
  unreviewedQuery.sources[0].url = 'https://www.ready.gov/wildfires?live=true';
  assert.throws(() => prepare(unreviewedQuery), /unreviewed query parameters/u);

  const paddedUrl = copy();
  paddedUrl.sources[0].url = ' https://www.ready.gov/wildfires';
  assert.throws(() => prepare(paddedUrl), /bounded URL/u);

  const falsePublisher = copy();
  falsePublisher.sources[0].publisher = 'Mindicraft Emergency Authority';
  assert.throws(() => prepare(falsePublisher), /publisher does not match/u);

  const falseKind = copy();
  falseKind.sources[0].kind = 'government-live-router';
  assert.throws(() => prepare(falseKind), /kind does not match/u);
});

test('emergency links are finite tel links and stay attached to the right region', () => {
  const wrongTitle = copy();
  wrongTitle.regions[1].title = 'Australia';
  assert.throws(() => prepare(wrongTitle), /title must remain United States/u);

  const wrongDisplay = copy();
  wrongDisplay.regions[1].emergency.display = '000';
  assert.throws(() => prepare(wrongDisplay), /display must remain 911/u);

  const activeCall = copy();
  activeCall.regions[1].emergency.call = 'tel:911,123';
  assert.throws(() => prepare(activeCall), /safe emergency tel link/u);

  const wrongCall = copy();
  wrongCall.regions[3].emergency.call = 'tel:911';
  assert.throws(() => prepare(wrongCall), /must remain tel:112/u);

  const inventedGlobalCall = copy();
  inventedGlobalCall.regions[0].emergency = {
    display: '911',
    call: 'tel:911',
    source_id: 'ready-wildfires',
  };
  assert.throws(() => prepare(inventedGlobalCall), /emergency must remain null/u);
});

test('evacuation, return-clearance, static-authority, and no-location boundaries fail closed', () => {
  for (const [mutate, pattern] of [
    [
      (value) => {
        value.boundary.live_status = 'This page has current fire and road status.';
      },
      /live_status must preserve the safety boundary/u,
    ],
    [
      (value) => {
        value.boundary.authority = 'Mindicraft instructions override local authorities.';
      },
      /authority must preserve the safety boundary/u,
    ],
    [
      (value) => {
        value.boundary.privacy = 'Mindicraft may infer your location.';
      },
      /privacy must preserve the safety boundary/u,
    ],
    [
      (value) => {
        value.paths[0].summary = 'Finish this guide before deciding whether to leave.';
      },
      /leave-first boundary/u,
    ],
    [
      (value) => {
        value.paths[0].steps[0].text = 'Stay and protect property.';
      },
      /immediate evacuation over property/u,
    ],
    [
      (value) => {
        value.paths[2].steps[0].text = 'Smoke advice permits staying after an order.';
      },
      /evacuation orders first/u,
    ],
    [
      (value) => {
        value.paths[2].steps[2].text = 'Any mask makes smoke harmless.';
      },
      /country-certified respirator limit/u,
    ],
    [
      (value) => {
        value.paths[1].steps[2].text = 'Return when the street looks quiet.';
      },
      /no-return boundary/u,
    ],
    [
      (value) => {
        value.paths[3].summary = 'Return when a map looks clear.';
      },
      /explicit clearance/u,
    ],
    [
      (value) => {
        value.paths[3].steps[0].text = 'Use a social post as clearance.';
      },
      /official-clearance gate/u,
    ],
    [
      (value) => {
        value.paths[3].steps[2].text = 'All sealed food and water is safe.';
      },
      /local water and food boundary/u,
    ],
    [
      (value) => {
        value.paths[3].steps[4].text = 'Ash cleanup is safe for everyone.';
      },
      /hazardous-ash boundary/u,
    ],
  ]) {
    const changed = copy();
    mutate(changed);
    assert.throws(() => prepare(changed), pattern);
  }

  const locationField = copy();
  locationField.care.latitude = 51.5;
  assert.throws(() => prepare(locationField), /unsafe field latitude/u);

  const profileField = copy();
  profileField.care.profile = { name: 'survivor' };
  assert.throws(() => prepare(profileField), /unsafe field profile/u);
});

test('the pure validator imports no I/O, clock, timer, environment, or network capability', () => {
  const moduleText = readFileSync(
    new URL('../guide/wildfire.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...moduleText.matchAll(
    /^import\s+.+?\s+from\s+['"]([^'"]+)['"];?$/gmu
  )].map((match) => match[1]);

  assert.deepEqual(imports, ['node:crypto']);
  assert.doesNotMatch(moduleText, /\bnode:(?:fs|http|https|net|tls|dns|dgram|child_process)\b/u);
  assert.doesNotMatch(
    moduleText,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|setTimeout|setInterval|setImmediate|queueMicrotask|Date\.now|process\.env|navigator\.geolocation)\b/u
  );
  assert.doesNotMatch(moduleText, /\bimport\s*\(/u);
});
