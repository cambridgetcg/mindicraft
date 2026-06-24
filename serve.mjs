#!/usr/bin/env node
// serve.mjs — mindicraft local server. Free. No gate. No auth. No tracking.
import { createServer } from 'http';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const ROOT = process.cwd();
const INDEX_DIR = join(ROOT, 'index');
const PORT = parseInt(process.argv[2] || '7780');

mkdirSync(INDEX_DIR, { recursive: true });

function loadIndex() {
  if (!existsSync(INDEX_DIR)) return [];
  const files = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const entries = [];
  for (const f of files) {
    try {
      const e = JSON.parse(readFileSync(join(INDEX_DIR, f), 'utf8'));
      if (e.title) entries.push(e);
    } catch {}
  }
  return entries.sort((a, b) => {
    const aSyn = a.category === 'synthesis' ? 1 : 0;
    const bSyn = b.category === 'synthesis' ? 1 : 0;
    if (aSyn !== bSyn) return aSyn - bSyn;
    const cert = { high: 0, medium: 1, low: 2 };
    const aC = cert[a.certainty] ?? 1;
    const bC = cert[b.certainty] ?? 1;
    if (aC !== bC) return aC - bC;
    return new Date(b.freshness || 0) - new Date(a.freshness || 0);
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(ROOT, 'site', 'index.html'), 'utf8'));
    return;
  }

  if (path === '/api/index') {
    const { q, c, limit, offset } = Object.fromEntries(url.searchParams);
    let entries = loadIndex();
    if (c) entries = entries.filter(e => (e.category || '') === c);
    if (q) {
      const ql = q.toLowerCase();
      entries = entries.filter(e =>
        (e.title || '').toLowerCase().includes(ql) ||
        (e.summary || '').toLowerCase().includes(ql) ||
        (e.category || '').toLowerCase().includes(ql) ||
        (e.url || '').toLowerCase().includes(ql)
      );
    }
    const lim = Math.min(parseInt(limit) || 100, 500);
    const off = parseInt(offset) || 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      count: entries.length, returned: entries.slice(off, off + lim).length,
      offset: off, limit: lim, free: true, gate: false,
      entries: entries.slice(off, off + lim),
    }, null, 2));
    return;
  }

  if (path === '/api/heartbeat') {
    const entries = loadIndex();
    const cats = {};
    for (const e of entries) { const c = e.category || 'unknown'; cats[c] = (cats[c] || 0) + 1; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: entries.length > 0 ? 'alive' : 'collecting',
      entries: entries.length, categories: Object.keys(cats).length,
      categoryBreakdown: Object.entries(cats).sort((a,b) => b[1] - a[1]).reduce((o,[k,v]) => (o[k]=v,o), {}),
      free: true, gate: false, no_auth: true, open_source: true, love: true,
    }, null, 2));
    return;
  }

  if (path === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
        const entry = {
          id, verb: 'darshanqing', from: data.from || 'anonymous', to: 'all',
          freshness: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
          certainty: data.certainty || 'medium', provenance: data.provenance || 'manual-submission',
          category: data.category || 'heurekin',
          title: (data.title || 'Untitled').slice(0, 300),
          url: (data.url || '').slice(0, 500),
          summary: (data.summary || '').slice(0, 500),
        };
        writeFileSync(join(INDEX_DIR, `${id}.json`), JSON.stringify(entry, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, free: true, gate: false, message: 'understanding received. love is. 🐍❤️' }));
      } catch (e) {
        res.writeHead(400);
        res.end('invalid JSON');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mindicraft on http://localhost:${PORT}`);
  console.log(`API: http://localhost:${PORT}/api/index`);
  console.log(`Free. No gate. No auth. No tracking. Love is. 🐍❤️`);
});