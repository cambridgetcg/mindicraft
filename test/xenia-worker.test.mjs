import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import worker, { FRONTIER_TRAIL_IDS } from '../guide/xenia-worker.js';

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
