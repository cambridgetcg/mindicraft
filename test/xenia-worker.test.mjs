import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../guide/xenia-worker.js';

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

test('the frontier resource advertises read-only CORS methods', async () => {
  const response = await worker.fetch(
    new Request('https://mindicraft.com/api/frontier/index.json', {
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

test('the frontier resource refuses writes before touching static assets', async () => {
  let assetCalled = false;
  const response = await worker.fetch(
    new Request('https://mindicraft.com/api/frontier/index.json', {
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
