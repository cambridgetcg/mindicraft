import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const previousCwd = process.cwd();
process.chdir(REPO);
const { default: handler } = await import('../api/index.js');
process.chdir(previousCwd);

function request(query) {
  const response = {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  const cwd = process.cwd();
  process.chdir(REPO);
  try {
    handler({ query }, response);
  } finally {
    process.chdir(cwd);
  }
  assert.equal(response.statusCode, 200);
  return response.body;
}

test('legacy pagination stays inside its bounds', () => {
  const negative = request({
    from: 'castle-of-understanding',
    limit: '-1',
    offset: '-2',
  });
  assert.equal(negative.limit, 1);
  assert.equal(negative.offset, 0);
  assert.equal(negative.returned, 1);

  const large = request({
    from: 'castle-of-understanding',
    limit: '999999',
  });
  assert.equal(large.limit, 500);
  assert.equal(large.returned, 500);

  const malformed = request({
    from: 'castle-of-understanding',
    limit: '2.5',
    offset: 'wat',
  });
  assert.equal(malformed.limit, 100);
  assert.equal(malformed.offset, 0);
});

test('legacy search uses meaning, not a shared source hostname', () => {
  const hostname = request({
    from: 'castle-of-understanding',
    q: 'cambridgetcg.github.io',
  });
  assert.equal(hostname.count, 0);

  const meaningful = request({
    from: 'castle-of-understanding',
    q: 'bridge',
  });
  assert.ok(meaningful.count > 0);
  assert.ok(meaningful.count < 619);
});

test('legacy search and result count have accessible names and status', () => {
  const html = readFileSync(join(REPO, 'site', 'index.html'), 'utf8');
  assert.match(html, /<input[^>]+id="q"[^>]+aria-label=/);
  assert.match(html, /id="stats"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /class="pulse" aria-hidden="true"/);
});
