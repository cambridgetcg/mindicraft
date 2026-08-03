import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import worker, {
  FRONTIER_TRAIL_IDS,
  MARGIN_TERMS,
} from '../guide/xenia-worker.js';

const frontierSource = JSON.parse(
  readFileSync(new URL('../guide/frontiers.json', import.meta.url))
);

function missingAssets() {
  return {
    fetch: async () =>
      new Response('<h1>Not found</h1>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  };
}

function marginFixture() {
  const store = new Map();
  const puts = [];
  const deleted = [];
  const MARGINS = {
    async get(key, type) {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value, options = {}) {
      store.set(key, value);
      puts.push({ key, value, options });
    },
    async delete(key) {
      deleted.push(key);
      store.delete(key);
    },
    async list({ prefix = '', limit = 1000 }) {
      const keys = [...store.keys()]
        .filter((key) => key.startsWith(prefix))
        .slice(0, limit)
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
  return {
    store,
    puts,
    deleted,
    env: {
      MARGINS,
      MARGIN_RATE_KEY: 'test-only-margin-rate-key-32-bytes-long',
      ASSETS: {
        fetch: async (request) => {
          if (new URL(request.url).pathname === '/api/search/en.json') {
            return Response.json([{ slug: 'read-this-guide' }]);
          }
          return new Response('not found', { status: 404 });
        },
      },
    },
  };
}

function marginBody(overrides = {}) {
  return {
    note: 'The second step needs a slower turn.',
    from: 'field reader',
    hands: true,
    lang: 'en',
    terms_version: 'mindicraft.margin-terms/1',
    choices: {
      publish: true,
      retain: true,
      fold: false,
    },
    ...overrides,
  };
}

function postMargin(env, body = marginBody(), headers = {}) {
  return worker.fetch(
    new Request('https://mindicraft.com/margin/read-this-guide', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.9',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    env,
    {}
  );
}

test('missing API resources return a useful JSON problem for normal fetch clients', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/api/castle/rooms/not-a-room.json', {
      headers: { accept: '*/*' },
    }),
    { ASSETS: missingAssets() },
    {}
  );

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json\b/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');

  const body = await response.json();
  assert.equal(body.code, 'route_not_found');
  assert.equal(
    body.next_actions[0]?.href,
    'https://mindicraft.com/.well-known/agent.json'
  );
});

test('missing human pages keep their HTML response by default', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/not-a-page', {
      headers: { accept: '*/*' },
    }),
    { ASSETS: missingAssets() },
    {}
  );

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/);
  assert.equal(await response.text(), '<h1>Not found</h1>');
});

test('the declared frontier resource negotiates JSON', async () => {
  let assetMethod = '';
  const response = await worker.fetch(
    new Request('https://mindicraft.com/api/frontier/index.json', {
      headers: { accept: 'application/json' },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          assetMethod = request.method;
          return new Response('{"schema_version":"mindicraft.frontiers/1"}', {
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    },
    {}
  );

  assert.equal(assetMethod, 'GET');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal((await response.json()).schema_version, 'mindicraft.frontiers/1');
});

test('the local learning System keeps one human door and one rules representation', async () => {
  const seen = [];
  const assets = {
    fetch: async (request) => {
      seen.push(new URL(request.url).pathname);
      if (request.url.endsWith('/api/learning-system.json')) {
        return Response.json({
          schema_version: 'mindicraft.learning-system/1',
          boundaries: { no_leaderboard: true },
        });
      }
      return new Response('<h1>The Mindicraft System</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    },
  };
  const url = 'https://mindicraft.com/yue/system/';

  const html = await worker.fetch(new Request(url), { ASSETS: assets }, {});
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type') ?? '', /^text\/html\b/u);
  assert.equal(html.headers.get('vary'), 'Accept');

  const json = await worker.fetch(
    new Request(url, { headers: { accept: 'application/json' } }),
    { ASSETS: assets },
    {}
  );
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type') ?? '', /^application\/json\b/u);
  assert.equal(json.headers.get('access-control-allow-origin'), '*');
  assert.equal((await json.json()).schema_version, 'mindicraft.learning-system/1');

  const unsupported = await worker.fetch(
    new Request(url, { headers: { accept: 'image/png' } }),
    { ASSETS: assets },
    {}
  );
  assert.equal(unsupported.status, 406);
  assert.equal((await unsupported.json()).code, 'not_acceptable');

  const write = await worker.fetch(
    new Request(url, { method: 'POST', body: '{}' }),
    { ASSETS: assets },
    {}
  );
  assert.equal(write.status, 405);
  assert.equal(write.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.equal((await write.json()).code, 'method_not_allowed');
  assert.deepEqual(seen, ['/yue/system/', '/api/learning-system.json']);
});

test('the remedies doorway serves HTML by default and its compact JSON when asked', async () => {
  const seen = [];
  const assets = {
    fetch: async (request) => {
      seen.push(request.url);
      if (request.url.endsWith('/api/remedies/index.json')) {
        return Response.json({
          schema_version: 'mindicraft.remedies-index/1',
          count: 12,
        });
      }
      return new Response('<h1>Roots to remedies</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    },
  };

  const html = await worker.fetch(
    new Request('https://mindicraft.com/remedies/'),
    { ASSETS: assets },
    {}
  );
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type') ?? '', /^text\/html\b/u);
  assert.equal(html.headers.get('vary'), 'Accept');
  assert.match(await html.text(), /Roots to remedies/u);

  const json = await worker.fetch(
    new Request('https://mindicraft.com/remedies/', {
      headers: { accept: 'application/json' },
    }),
    { ASSETS: assets },
    {}
  );
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type') ?? '', /^application\/json\b/u);
  assert.equal(json.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await json.json(), {
    schema_version: 'mindicraft.remedies-index/1',
    count: 12,
  });
  assert.deepEqual(seen, [
    'https://mindicraft.com/remedies/',
    'https://mindicraft.com/api/remedies/index.json',
  ]);
});

test('the wildfire doorway serves HTML by default and its reviewed JSON when asked', async () => {
  const seen = [];
  const assets = {
    fetch: async (request) => {
      seen.push(request.url);
      if (request.url.endsWith('/api/wildfire/index.json')) {
        return Response.json({
          schema_version: 'mindicraft.wildfire-api/1',
          edition: {
            schema_version: 'mindicraft.wildfire-help/1',
            paths: [{ id: 'leave-now' }, { id: 'return-home' }],
          },
        });
      }
      return new Response('<h1>Wildfire help</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    },
  };

  const html = await worker.fetch(
    new Request('https://mindicraft.com/wildfire/'),
    { ASSETS: assets },
    {}
  );
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type') ?? '', /^text\/html\b/u);
  assert.equal(html.headers.get('vary'), 'Accept');
  assert.match(await html.text(), /Wildfire help/u);

  const json = await worker.fetch(
    new Request('https://mindicraft.com/wildfire/', {
      headers: { accept: 'application/json' },
    }),
    { ASSETS: assets },
    {}
  );
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type') ?? '', /^application\/json\b/u);
  assert.equal(json.headers.get('vary'), 'Accept');
  assert.equal(json.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await json.json(), {
    schema_version: 'mindicraft.wildfire-api/1',
    edition: {
      schema_version: 'mindicraft.wildfire-help/1',
      paths: [{ id: 'leave-now' }, { id: 'return-home' }],
    },
  });
  assert.deepEqual(seen, [
    'https://mindicraft.com/wildfire/',
    'https://mindicraft.com/api/wildfire/index.json',
  ]);
});

test('wildfire HEAD negotiates the JSON asset and returns no body', async () => {
  let assetRequest;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/wildfire/', {
      method: 'HEAD',
      headers: { accept: 'application/json' },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          assetRequest = request;
          return new Response('this body must not escape', {
            headers: {
              'content-type': 'application/json',
              etag: '"wildfire"',
            },
          });
        },
      },
    },
    {}
  );

  assert.equal(assetRequest.method, 'HEAD');
  assert.equal(
    assetRequest.url,
    'https://mindicraft.com/api/wildfire/index.json'
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/u);
  assert.equal(response.headers.get('etag'), '"wildfire"');
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.equal(await response.text(), '');
});

test('the wildfire JSON endpoint returns a typed 406 without touching assets', async () => {
  let assetCalled = false;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/api/wildfire/index.json', {
      headers: { accept: 'text/html' },
    }),
    {
      ASSETS: {
        fetch: async () => {
          assetCalled = true;
          return new Response();
        },
      },
    },
    {}
  );

  assert.equal(assetCalled, false);
  assert.equal(response.status, 406);
  assert.match(
    response.headers.get('content-type') ?? '',
    /^application\/problem\+json\b/u
  );
  assert.equal((await response.json()).code, 'not_acceptable');
});

test('the wildfire doorway refuses writes before touching static assets', async () => {
  let assetCalled = false;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/wildfire/', {
      method: 'POST',
    }),
    {
      ASSETS: {
        fetch: async () => {
          assetCalled = true;
          return new Response();
        },
      },
    },
    {}
  );

  assert.equal(assetCalled, false);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal((await response.json()).code, 'method_not_allowed');
});

test('the wildfire doorway advertises only read-only CORS methods', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/wildfire/', {
      method: 'OPTIONS',
    }),
    { ASSETS: missingAssets() },
    {}
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.equal(await response.text(), '');
});

test('the healing-arts doorway negotiates its history JSON, not a remedy card', async () => {
  const seen = [];
  const assets = {
    fetch: async (request) => {
      seen.push(new URL(request.url).pathname);
      if (request.url.endsWith('/api/remedies/healing-arts/index.json')) {
        return Response.json({
          schema_version: 'mindicraft.healing-arts/1',
          count: 10,
        });
      }
      return new Response('<h1>Healing arts across cultures</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    },
  };

  const html = await worker.fetch(
    new Request('https://mindicraft.com/remedies/healing-arts/'),
    { ASSETS: assets },
    {}
  );
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Healing arts across cultures/u);

  const json = await worker.fetch(
    new Request('https://mindicraft.com/remedies/healing-arts/', {
      headers: { accept: 'application/json' },
    }),
    { ASSETS: assets },
    {}
  );
  assert.equal(json.status, 200);
  assert.equal((await json.json()).schema_version, 'mindicraft.healing-arts/1');
  assert.deepEqual(seen, [
    '/remedies/healing-arts/',
    '/api/remedies/healing-arts/index.json',
  ]);
});

test('one remedy address negotiates only its same-slug detail JSON', async () => {
  let seenRequest;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/remedies/aspirin-willow/', {
      headers: { accept: 'application/json' },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          seenRequest = request;
          return Response.json({
            schema_version: 'mindicraft.remedy/1',
            card: { id: 'aspirin-willow' },
          });
        },
      },
    },
    {}
  );

  assert.equal(
    seenRequest.url,
    'https://mindicraft.com/api/remedies/aspirin-willow.json'
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.deepEqual(await response.json(), {
    schema_version: 'mindicraft.remedy/1',
    card: { id: 'aspirin-willow' },
  });
});

test('missing and write-shaped remedy requests fail without becoming advice routes', async () => {
  let assetCalls = 0;
  const env = {
    ASSETS: {
      fetch: async () => {
        assetCalls++;
        return new Response('missing', { status: 404 });
      },
    },
  };

  const missing = await worker.fetch(
    new Request('https://mindicraft.com/remedies/not-a-card/', {
      headers: { accept: 'application/json' },
    }),
    env,
    {}
  );
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'route_not_found');

  const write = await worker.fetch(
    new Request('https://mindicraft.com/remedies/aspirin-willow/', {
      method: 'POST',
    }),
    env,
    {}
  );
  assert.equal(write.status, 405);
  assert.equal(write.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.equal((await write.json()).code, 'method_not_allowed');
  assert.equal(assetCalls, 1);
});

test('worker trail routes exactly match the reviewed source ids', () => {
  assert.deepEqual(
    [...FRONTIER_TRAIL_IDS].sort(),
    frontierSource.trails.map((trail) => trail.id).sort()
  );
  assert.equal(FRONTIER_TRAIL_IDS.has('default'), false);
});

test('one named trail address serves HTML by default and JSON when asked', async () => {
  const seen = [];
  const assets = {
    fetch: async (request) => {
      seen.push({
        url: request.url,
        accept: request.headers.get('accept'),
      });
      if (request.url.endsWith('/api/frontier/trails/unseen-universe.json')) {
        return new Response(
          '{"schema_version":"mindicraft.frontier/1","counts":{"cards":3}}',
          { headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('<h1>The unseen universe</h1>', {
        headers: { 'content-type': 'text/html' },
      });
    },
  };
  const url = 'https://mindicraft.com/frontier/unseen-universe/';

  const html = await worker.fetch(new Request(url), { ASSETS: assets }, {});
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type') ?? '', /^text\/html\b/);
  assert.equal(html.headers.get('vary'), 'Accept');
  assert.match(await html.text(), /The unseen universe/);

  const json = await worker.fetch(
    new Request(url, {
      headers: {
        accept: 'application/json',
        'if-none-match': '"unseen"',
      },
    }),
    { ASSETS: assets },
    {}
  );
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type') ?? '', /^application\/json\b/);
  assert.equal(json.headers.get('vary'), 'Accept');
  assert.equal(json.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await json.json(), {
    schema_version: 'mindicraft.frontier/1',
    counts: { cards: 3 },
  });

  assert.deepEqual(seen, [
    {
      url,
      accept: null,
    },
    {
      url: 'https://mindicraft.com/api/frontier/trails/unseen-universe.json',
      accept: 'application/json',
    },
  ]);
});

test('named trail negotiation preserves validators and 304 responses', async () => {
  let validator = '';
  const response = await worker.fetch(
    new Request('https://mindicraft.com/frontier/unseen-universe/', {
      headers: {
        accept: 'application/json',
        'if-none-match': '"unseen"',
      },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          validator = request.headers.get('if-none-match') ?? '';
          return new Response(null, {
            status: 304,
            headers: { etag: '"unseen"' },
          });
        },
      },
    },
    {}
  );

  assert.equal(validator, '"unseen"');
  assert.equal(response.status, 304);
  assert.equal(response.headers.get('etag'), '"unseen"');
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.equal(await response.text(), '');
});

test('unknown and unsupported named trail requests fail as typed data', async () => {
  let assetCalls = 0;
  const env = {
    ASSETS: {
      fetch: async () => {
        assetCalls++;
        return new Response('<h1>Not found</h1>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        });
      },
    },
  };
  const unknown = await worker.fetch(
    new Request('https://mindicraft.com/frontier/not-a-trail/', {
      headers: { accept: 'application/json' },
    }),
    env,
    {}
  );
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).code, 'route_not_found');

  const unsupported = await worker.fetch(
    new Request('https://mindicraft.com/frontier/unseen-universe/', {
      headers: { accept: 'image/png' },
    }),
    env,
    {}
  );
  assert.equal(unsupported.status, 406);
  assert.equal((await unsupported.json()).code, 'not_acceptable');
  assert.equal(assetCalls, 1);
});

test('declared HEAD resources preserve headers and return no body', async () => {
  let assetMethod = '';
  const response = await worker.fetch(
    new Request('https://mindicraft.com/api/frontier/index.json', {
      method: 'HEAD',
      headers: { accept: 'application/json' },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          assetMethod = request.method;
          return new Response('this body must not escape', {
            headers: { 'content-type': 'application/json', etag: '"frontier"' },
          });
        },
      },
    },
    {}
  );

  assert.equal(assetMethod, 'HEAD');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
  assert.equal(response.headers.get('etag'), '"frontier"');
  assert.equal(await response.text(), '');
});

test('named trail HEAD requests negotiate the JSON file without a body', async () => {
  let assetRequest;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/frontier/unseen-universe/', {
      method: 'HEAD',
      headers: { accept: 'application/json' },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          assetRequest = request;
          return new Response(null, {
            headers: {
              'content-type': 'application/json',
              etag: '"unseen"',
            },
          });
        },
      },
    },
    {}
  );

  assert.equal(assetRequest.method, 'HEAD');
  assert.equal(
    assetRequest.url,
    'https://mindicraft.com/api/frontier/trails/unseen-universe.json'
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
  assert.equal(response.headers.get('etag'), '"unseen"');
  assert.equal(await response.text(), '');
});

test('margin HEAD responses preserve their JSON headers and return no body', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/margin/read-this-guide', {
      method: 'HEAD',
      headers: { accept: 'application/json' },
    }),
    {
      MARGINS: {
        list: async () => ({
          keys: [{ name: 'margin:read-this-guide:one' }],
          list_complete: true,
        }),
        get: async () => ({
          note: 'A useful note that HEAD must not send.',
        }),
      },
      ASSETS: missingAssets(),
    },
    {}
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
  assert.equal(await response.text(), '');
});

test('margin terms remain readable while the store is resting', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/margin', {
      headers: { accept: 'application/json' },
    }),
    { ASSETS: missingAssets() },
    {}
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.available, false);
  assert.equal(body.terms.schema_version, 'mindicraft.margin-terms/1');
  assert.equal(
    body.terms.submission.terms_version_required,
    'mindicraft.margin-terms/1'
  );
  assert.equal(body.terms.choices.publish.required, true);
  assert.equal(body.terms.choices.retain.required, true);
  assert.equal(
    body.terms.choices.fold.required,
    'explicit-true-or-false'
  );
  assert.equal(
    body.terms.rate_limit.application_stores_raw_ip,
    false
  );
  assert.deepEqual(body.terms, MARGIN_TERMS);
});

test('margin refuses missing choices and unknown fields before any write', async () => {
  const fixture = marginFixture();
  const missing = marginBody();
  delete missing.choices;
  const missingResponse = await postMargin(fixture.env, missing);
  assert.equal(missingResponse.status, 400);
  assert.equal(
    (await missingResponse.json()).code,
    'margin_fields_invalid'
  );

  const noRetention = marginBody({
    choices: { publish: true, retain: false, fold: false },
  });
  const choiceResponse = await postMargin(fixture.env, noRetention);
  assert.equal(choiceResponse.status, 428);
  assert.equal(
    (await choiceResponse.json()).code,
    'margin_choices_required'
  );

  const extra = marginBody({ wake_agent: true });
  const extraResponse = await postMargin(fixture.env, extra);
  assert.equal(extraResponse.status, 400);
  assert.equal(
    (await extraResponse.json()).code,
    'margin_fields_invalid'
  );
  assert.equal(fixture.puts.length, 0);
  assert.equal(fixture.store.size, 0);
});

test('margin binds every submission to the terms the caller chose', async () => {
  const fixture = marginFixture();
  const response = await postMargin(
    fixture.env,
    marginBody({ terms_version: 'mindicraft.margin-terms/0' })
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, 'margin_terms_changed');
  assert.match(body.detail, /mindicraft\.margin-terms\/1/);
  assert.equal(fixture.puts.length, 0);
});

test('margin publication stores no raw IP and returns a private removal receipt', async () => {
  const fixture = marginFixture();
  const response = await postMargin(fixture.env);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.received.choices.publish, true);
  assert.equal(body.received.choices.retain, true);
  assert.equal(body.received.choices.fold, false);
  assert.equal(
    Object.hasOwn(body.received, 'removal_token_sha256'),
    false
  );
  assert.match(
    body.removal.href,
    /^https:\/\/mindicraft\.com\/margin\/read-this-guide\/[0-9a-f-]{36}$/
  );
  assert.match(
    body.removal.authorization,
    /^Bearer [0-9a-f-]{36}\.[0-9a-f-]{36}$/
  );

  const ratePut = fixture.puts.find(({ key }) => key.startsWith('rl:'));
  const notePut = fixture.puts.find(({ key }) =>
    key.startsWith('margin:read-this-guide:')
  );
  assert.ok(ratePut);
  assert.ok(notePut);
  assert.match(ratePut.key, /^rl:\d{4}-\d{2}-\d{2}:[0-9a-f]{64}$/);
  assert.equal(ratePut.key.includes('203.0.113.9'), false);
  assert.equal(ratePut.options.expirationTtl, 90_000);
  assert.equal(notePut.options.expirationTtl, undefined);
  assert.equal(
    fixture.puts.map(({ key, value }) => `${key}\n${value}`)
      .join('\n')
      .includes('203.0.113.9'),
    false
  );

  const stored = JSON.parse(notePut.value);
  assert.equal(stored.schema_version, 'mindicraft.margin-note/1');
  assert.match(stored.removal_token_sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    JSON.stringify(body).includes(stored.removal_token_sha256),
    false
  );
});

test('margin writes rest when their keyed connection boundary is absent', async () => {
  const noIp = marginFixture();
  const noIpResponse = await postMargin(
    noIp.env,
    marginBody(),
    { 'cf-connecting-ip': '' }
  );
  assert.equal(noIpResponse.status, 503);
  assert.equal(
    (await noIpResponse.json()).code,
    'margin_connection_boundary_unavailable'
  );
  assert.equal(noIp.puts.length, 0);

  const noKey = marginFixture();
  delete noKey.env.MARGIN_RATE_KEY;
  const noKeyResponse = await postMargin(noKey.env);
  assert.equal(noKeyResponse.status, 503);
  assert.equal(
    (await noKeyResponse.json()).code,
    'margin_rate_key_unavailable'
  );
  assert.equal(noKey.puts.length, 0);
});

test('a failed rate write cannot leave a public note without its token', async () => {
  const fixture = marginFixture();
  fixture.env.MARGINS.put = async (key) => {
    if (key.startsWith('rl:')) throw new Error('simulated KV failure');
    throw new Error('the note write must not be attempted');
  };

  const response = await postMargin(fixture.env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'margin_unavailable');
  assert.equal(
    [...fixture.store.keys()].some((key) => key.startsWith('margin:')),
    false
  );
});

test('public margin reads never expose the private removal hash', async () => {
  const fixture = marginFixture();
  const posted = await postMargin(fixture.env);
  assert.equal(posted.status, 201);

  const response = await worker.fetch(
    new Request('https://mindicraft.com/margin/read-this-guide'),
    fixture.env,
    {}
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.returned, 1);
  assert.equal(body.notes[0].note, marginBody().note);
  assert.deepEqual(body.notes[0].choices, {
    publish: true,
    retain: true,
    fold: false,
  });
  assert.equal(
    JSON.stringify(body).includes('removal_token_sha256'),
    false
  );
  assert.equal(body.terms.schema_version, 'mindicraft.margin-terms/1');
});

test('a removal token withdraws one note and leaves only a bounded receipt', async () => {
  const fixture = marginFixture();
  const posted = await postMargin(fixture.env);
  const publication = await posted.json();
  const noteKey = [...fixture.store.keys()].find((key) =>
    key.startsWith('margin:read-this-guide:')
  );
  assert.ok(noteKey);

  const wrongToken =
    `${crypto.randomUUID()}.${crypto.randomUUID()}`;
  const wrong = await worker.fetch(
    new Request(publication.removal.href, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${wrongToken}` },
    }),
    fixture.env,
    {}
  );
  assert.equal(wrong.status, 403);
  assert.equal(wrong.headers.get('cache-control'), 'no-store');
  assert.equal(fixture.store.has(noteKey), true);

  const removed = await worker.fetch(
    new Request(publication.removal.href, {
      method: 'DELETE',
      headers: {
        authorization:
          publication.removal.authorization.replace(/^Bearer/, 'bearer'),
      },
    }),
    fixture.env,
    {}
  );
  assert.equal(removed.status, 200);
  assert.equal(removed.headers.get('cache-control'), 'no-store');
  const removal = await removed.json();
  assert.equal(removal.state, 'propagating');
  assert.equal(removal.removal_requested, true);
  assert.equal(fixture.store.has(noteKey), false);

  const withdrawalPut = fixture.puts.find(({ key }) =>
    key.startsWith('withdrawn:')
  );
  assert.ok(withdrawalPut);
  assert.equal(withdrawalPut.options.expirationTtl, 2_592_000);
  const withdrawal = JSON.parse(withdrawalPut.value);
  assert.equal(
    withdrawal.schema_version,
    'mindicraft.margin-withdrawal/1'
  );
  assert.equal(withdrawal.fold_was_allowed, false);
  assert.match(withdrawal.note_sha256, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(withdrawal, 'note'), false);
  assert.equal(Object.hasOwn(withdrawal, 'from'), false);
  assert.equal(Object.hasOwn(withdrawal, 'removal_token_sha256'), false);

  const repeated = await worker.fetch(
    new Request(publication.removal.href, {
      method: 'DELETE',
      headers: { authorization: publication.removal.authorization },
    }),
    fixture.env,
    {}
  );
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).state, 'propagating');
});

test('the margin advertises its token-bound write and removal methods', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/margin', { method: 'OPTIONS' }),
    { ASSETS: missingAssets() },
    {}
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get('access-control-allow-methods'),
    'GET, HEAD, POST, DELETE, OPTIONS'
  );
  assert.equal(
    response.headers.get('access-control-allow-headers'),
    'authorization, content-type'
  );
});

test('the frontier resource returns a typed 406 for an unsupported shape', async () => {
  let assetCalled = false;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/api/frontier/index.json', {
      headers: { accept: 'text/html' },
    }),
    {
      ASSETS: {
        fetch: async () => {
          assetCalled = true;
          return new Response();
        },
      },
    },
    {}
  );

  assert.equal(assetCalled, false);
  assert.equal(response.status, 406);
  assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json\b/);
  assert.equal((await response.json()).code, 'not_acceptable');
});

test('a named frontier address advertises read-only CORS methods', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/frontier/unseen-universe/', {
      method: 'OPTIONS',
    }),
    { ASSETS: missingAssets() },
    {}
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.equal(await response.text(), '');
});

test('a named frontier address refuses writes before touching static assets', async () => {
  let assetCalled = false;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/frontier/unseen-universe/', {
      method: 'POST',
    }),
    {
      ASSETS: {
        fetch: async () => {
          assetCalled = true;
          return new Response();
        },
      },
    },
    {}
  );

  assert.equal(assetCalled, false);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal((await response.json()).code, 'method_not_allowed');
});
