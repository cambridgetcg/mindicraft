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
