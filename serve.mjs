#!/usr/bin/env node
// serve.mjs — the free, no-gate HTTP API + web interface for mindicraft.
//
// GET /                    Web interface (searchable, artsy)
// GET /api/index           Full index (JSON)
// GET /api/index?q=love    Search
// GET /api/index?c=kinqing Filter by category
// GET /api/index/:id       Single entry
// POST /api/submit         Submit a new entry (no auth, no gate)
// GET /api/heartbeat       Collector status

import { createServer } from 'http';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const INDEX_DIR = join(ROOT, 'index');
const PORT = parseInt(process.argv[2] || '7780');

mkdirSync(INDEX_DIR, { recursive: true });

function loadIndex() {
  const files = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const entries = [];
  for (const f of files) {
    try {
      entries.push(JSON.parse(readFileSync(join(INDEX_DIR, f), 'utf8')));
    } catch {}
  }
  return entries.sort((a, b) => new Date(b.freshness) - new Date(a.freshness));
}

function searchIndex(entries, q) {
  const ql = q.toLowerCase();
  return entries.filter(e =>
    (e.title || '').toLowerCase().includes(ql) ||
    (e.summary || '').toLowerCase().includes(ql) ||
    (e.category || '').toLowerCase().includes(ql) ||
    (e.url || '').toLowerCase().includes(ql)
  );
}

function filterCategory(entries, cat) {
  return entries.filter(e => (e.category || '') === cat);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const q = url.searchParams.get('q');
  const c = url.searchParams.get('c');

  // CORS — no gate
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(WEB_INTERFACE);
    return;
  }

  if (path === '/api/index') {
    let entries = loadIndex();
    if (q) entries = searchIndex(entries, q);
    if (c) entries = filterCategory(entries, c);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: entries.length, entries }, null, 2));
    return;
  }

  if (path.startsWith('/api/index/') && path.length > 11) {
    const id = path.split('/').pop().replace('.json', '');
    const entry = loadIndex().find(e => e.id === id);
    if (entry) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entry, null, 2));
    } else {
      res.writeHead(404);
      res.end('not found');
    }
    return;
  }

  if (path === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const entry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          verb: 'darshanqing',
          from: data.from || 'anonymous',
          to: 'all',
          freshness: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
          certainty: data.certainty || 'low',
          provenance: 'manual-submission',
          category: data.category || 'heurekin',
          title: data.title || 'Untitled',
          url: data.url || '',
          summary: data.summary || '',
        };
        writeFileSync(join(INDEX_DIR, `${entry.id}.json`), JSON.stringify(entry, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: entry.id }));
      } catch (e) {
        res.writeHead(400);
        res.end('invalid JSON');
      }
    });
    return;
  }

  if (path === '/api/heartbeat') {
    const entries = loadIndex();
    const summary = existsSync(join(INDEX_DIR, '_summary.json'))
      ? JSON.parse(readFileSync(join(INDEX_DIR, '_summary.json'), 'utf8')) : {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'alive',
      entries: entries.length,
      categories: [...new Set(entries.map(e => e.category))].length,
      lastUpdated: summary.lastUpdated || 'never',
      free: true,
      gate: false,
    }, null, 2));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mindicraft serving on http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/index`);
  console.log(`Free. No gate. No auth. No tracking.`);
});

// ── Web interface ──────────────────────────────────────────────

const WEB_INTERFACE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>mindicraft — the data collector of AI</title>
<style>
:root{--bg:#0a0c10;--surface:#131720;--line:#1e2632;--ink:#eef2f8;--muted:#6b7a90;--love:#e0507a;--trust:#50b8e0;--gold:#f5c451;--green:#54e08a}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:ui-rounded,system-ui,sans-serif;background:radial-gradient(800px 600px at 50% -10%,#161e2e 0%,var(--bg) 60%);color:var(--ink);min-height:100vh;-webkit-font-smoothing:antialiased}
.c{max-width:760px;margin:0 auto;padding:32px 20px 80px}
.hero{text-align:center;margin-bottom:32px}
.hero h1{font-family:Georgia,serif;font-size:36px;font-weight:400;letter-spacing:-1px}
.hero p{color:var(--muted);font-size:14px;margin-top:4px}
.hero .badge{display:inline-block;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:4px 12px;font-size:11px;color:var(--green);margin:8px 4px 0}
.search{display:flex;gap:8px;margin-bottom:20px}
.search input{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 18px;color:var(--ink);font-size:15px;outline:none}
.search input:focus{border-color:var(--trust)}
.search button{background:var(--trust);color:#fff;border:none;border-radius:10px;padding:14px 20px;font-size:14px;cursor:pointer}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
.filter{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:4px 12px;font-size:12px;color:var(--muted);cursor:pointer;transition:border-color .2s}
.filter:hover{border-color:var(--trust)}
.filter.active{border-color:var(--trust);color:var(--trust)}
.entries{display:flex;flex-direction:column;gap:8px}
.entry{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.entry .cat{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);margin-bottom:4px}
.entry .title{font-size:15px;font-family:Georgia,serif;margin-bottom:2px}
.entry .title a{color:var(--ink);text-decoration:none}
.entry .title a:hover{color:var(--trust)}
.entry .summary{font-size:13px;color:var(--muted);line-height:1.5}
.entry .meta{font-size:11px;color:var(--muted);margin-top:6px}
.entry .meta .me{color:var(--trust)}.entry .meta .qing{color:var(--love)}
.stats{text-align:center;color:var(--muted);font-size:13px;margin:20px 0}
.footer{text-align:center;color:var(--muted);font-size:12px;margin-top:40px}
.footer .heart{color:var(--love)}
.empty{text-align:center;color:var(--muted);padding:40px;font-size:14px}
</style>
</head>
<body><div class="c">
<div class="hero">
<h1>mindicraft</h1>
<p>the data collector of AI — the whole internet, categorized and sorted</p>
<span class="badge">free</span><span class="badge">open source</span><span class="badge">no gate</span><span class="badge">no auth</span><span class="badge">no tracking</span>
</div>

<div class="search">
<input id="q" placeholder="search the index..." onkeydown="if(event.key==='Enter')search()">
<button onclick="search()">find</button>
</div>

<div class="filters" id="filters"></div>
<div class="stats" id="stats"></div>
<div class="entries" id="entries"><div class="empty">loading...</div></div>

<div class="footer">
mindicraft.com — love is understanding. love is truth. love is sharing.<br>
<span class="heart">love is not seeking individual gains.</span> 🐍❤️
</div>
</div>

<script>
let currentCat = '';
async function load(q, c) {
  let url = '/api/index';
  if (q) url += '?q=' + encodeURIComponent(q);
  if (c) url += (q ? '&' : '?') + 'c=' + encodeURIComponent(c);
  const r = await fetch(url);
  const data = await r.json();

  document.getElementById('stats').textContent = data.count + ' entries';

  // Categories
  const cats = [...new Set(data.entries.map(e => e.category))];
  const filtersEl = document.getElementById('filters');
  filtersEl.innerHTML = '<span class="filter' + (!c ? ' active' : '') + '" onclick="load(null,null)">all</span>' +
    cats.map(cat => '<span class="filter' + (c === cat ? ' active' : '') + '" onclick="load(null,\\''+cat+'\\')">' + cat + '</span>').join('');

  // Entries
  const el = document.getElementById('entries');
  if (data.entries.length === 0) {
    el.innerHTML = '<div class="empty">no entries found. the index is growing.</div>';
    return;
  }
  el.innerHTML = data.entries.slice(0, 50).map(e =>
    '<div class="entry">' +
    '<div class="cat">' + (e.category || 'unknown') + '</div>' +
    '<div class="title"><a href="' + e.url + '" target="_blank">' + e.title + '</a></div>' +
    '<div class="summary">' + (e.summary || '').slice(0, 200) + '</div>' +
    '<div class="meta">freshness: ' + (e.freshness||'?') + ' · certainty: ' + (e.certainty||'?') + ' · provenance: ' + (e.provenance||'?') + '</div>' +
    '</div>'
  ).join('');
}

function search() {
  const q = document.getElementById('q').value;
  load(q, currentCat);
}

load();
</script>
</body></html>`;