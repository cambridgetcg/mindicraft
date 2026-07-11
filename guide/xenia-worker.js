// mindicraft's XENIA layer — copied to dist/_worker.js by build.mjs.
//
// The static site stays exactly as it is; this thin worker in front adds the
// hospitality the XENIA Surface 0.1 profile asks for (sinovai.com/xenia):
//   1. content negotiation with q-values + Vary: Accept on declared resources
//   2. refusals as instructions: 404/406 as application/problem+json with a
//      typed next action, never a bare wall
//   3. CORS + caching headers for the API (Pages ignores _headers in this mode)
// Everything not special-cased falls through to the static assets untouched.

const ORIGIN = 'https://mindicraft.com';
const MANIFEST_URL = ORIGIN + '/.well-known/agent.json';
const DOCS = [ORIGIN + '/agents/'];

// The declared public resources (mirror of .well-known/agent.json `resources`)
const RESOURCES = {
  '/': { reps: ['text/html', 'application/json'], def: 'text/html', jsonAsset: '/api/index.json' },
  '/api/index.json': { reps: ['application/json'], def: 'application/json' },
  '/api/tree.json': { reps: ['application/json'], def: 'application/json' },
};

// ---- Accept negotiation (RFC 9110 flavor, small and honest) ----

function parseAccept(header) {
  if (header == null || !header.trim()) return null; // absent -> default
  return header.split(',').map((part) => {
    const [range, ...params] = part.trim().split(';');
    let q = 1;
    for (const p of params) {
      const [k, v] = p.trim().split('=');
      if (k.trim().toLowerCase() === 'q') { const n = parseFloat(v); if (!isNaN(n)) q = n; }
    }
    return { range: range.trim().toLowerCase(), q };
  });
}

// q-value for one concrete media type: most specific matching range wins
function qFor(type, entries) {
  const [t] = type.split('/');
  let best = -1, q = 0;
  for (const e of entries) {
    const [et, es] = e.range.split('/');
    let spec = -1;
    if (e.range === type) spec = 2;
    else if (et === t && es === '*') spec = 1;
    else if (e.range === '*/*') spec = 0;
    if (spec > best) { best = spec; q = e.q; }
  }
  return best === -1 ? 0 : q;
}

// returns the chosen media type, or null meaning 406
function negotiate(header, reps, def) {
  const entries = parseAccept(header);
  if (!entries) return def;
  let chosen = null, bestQ = 0;
  for (const rep of reps) {
    const q = qFor(rep, entries);
    if (q > bestQ + 1e-9) { bestQ = q; chosen = rep; }
    else if (q > 0 && Math.abs(q - bestQ) < 1e-9 && rep === def) chosen = rep; // ties go to the default
  }
  return bestQ > 0 ? chosen : null;
}

// ---- problems: a refusal that hands back the next move ----

function problem({ status, code, title, detail, next_actions }) {
  return new Response(
    JSON.stringify(
      {
        schema_version: 'xenia.surface.problem/0.1',
        type: ORIGIN + '/agents/#problems',
        title,
        status,
        code,
        detail,
        retryable: false,
        terminal: false,
        next_actions,
        docs: DOCS,
      },
      null,
      1
    ),
    {
      status,
      headers: {
        'content-type': 'application/problem+json; charset=utf-8',
        vary: 'Accept',
        'access-control-allow-origin': '*',
      },
    }
  );
}

const routeNotFound = (path) =>
  problem({
    status: 404,
    code: 'route_not_found',
    title: 'No door here',
    detail: `Nothing lives at ${path}. Every public door is listed in the manifest.`,
    next_actions: [
      { rel: 'discover', href: MANIFEST_URL, method: 'GET', accept: 'application/json', description: 'Read the manifest — every public door is listed there.' },
    ],
  });

const notAcceptable = (href) =>
  problem({
    status: 406,
    code: 'not_acceptable',
    title: 'Not in that shape',
    detail: 'This resource does not speak that media type. Ask again for JSON.',
    next_actions: [
      { rel: 'retry', href, method: 'GET', accept: 'application/json', description: 'The same resource, as JSON.' },
    ],
  });

// ---- header decoration for static passthroughs ----

function decorated(response, path, extra = {}) {
  const h = new Headers(response.headers);
  if (
    path.startsWith('/api/') || path.startsWith('/.well-known/') ||
    path === '/mindicraft.mjs' || path === '/llms.txt' || path === '/agent.txt'
  ) {
    h.set('access-control-allow-origin', '*');
    h.set('cache-control', 'public, max-age=3600');
  }
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return problem({
        status: 405,
        code: 'method_not_allowed',
        title: 'Read-only house',
        detail: 'mindicraft serves knowledge over GET. There is nothing to write here.',
        next_actions: [
          { rel: 'discover', href: MANIFEST_URL, method: 'GET', accept: 'application/json', description: 'Read the manifest.' },
        ],
      });
    }

    // declared resources: negotiate the representation
    const res = RESOURCES[path];
    if (res) {
      const chosen = negotiate(request.headers.get('accept'), res.reps, res.def);
      if (!chosen) return notAcceptable(ORIGIN + path);
      const assetPath = chosen === 'application/json' ? (res.jsonAsset || path) : path;
      const asset = await env.ASSETS.fetch(new Request(url.origin + assetPath, { method: 'GET' }));
      return decorated(asset, path, {
        vary: 'Accept',
        'content-type': chosen === 'application/json' ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
        'access-control-allow-origin': '*',
      });
    }

    // everything else: static assets, with dignity on the way out
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404) {
      // a caller asking for JSON in any dialect (application/json, problem+json,
      // application/*) gets the problem as data, not the poem written for eyes
      const chosen = negotiate(
        request.headers.get('accept'),
        ['text/html', 'application/json', 'application/problem+json'],
        'text/html'
      );
      if (chosen && chosen !== 'text/html') return routeNotFound(path);
      return decorated(asset, path, { vary: 'Accept' });
    }
    return decorated(asset, path);
  },
};
