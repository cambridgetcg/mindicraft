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

function boundedInteger(value, fallback, min, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  if (!/^[+-]?\d+$/.test(String(value).trim())) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function loadIndex() {
  if (!existsSync(INDEX_DIR)) return [];
  const files = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const entries = [];
  for (const f of files) {
    try {
      const e = JSON.parse(readFileSync(join(INDEX_DIR, f), 'utf8'));
      if (e.title) entries.push(e);
    } catch (e) {
      console.error(`loadIndex: failed to parse ${f}:`, e.message);
    }
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
    const params = Object.fromEntries(url.searchParams);
    const { q, c, limit, offset } = params;
    let entries = loadIndex();
    if (params.from) entries = entries.filter(e => (e.from || '') === params.from);
    if (q) {
      const ql = String(q).toLowerCase();
      entries = entries.filter(e =>
        String(e.title || '').toLowerCase().includes(ql) ||
        String(e.summary || '').toLowerCase().includes(ql) ||
        String(e.category || '').toLowerCase().includes(ql) ||
        String(e.from || '').toLowerCase().includes(ql) ||
        String(e.collection || '').toLowerCase().includes(ql) ||
        String(e.kind || '').toLowerCase().includes(ql)
      );
    }
    const categoryCounts = {};
    for (const entry of entries) {
      const category = entry.category || 'unknown';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
    if (c) entries = entries.filter(e => (e.category || '') === c);
    const lim = boundedInteger(limit, 100, 1, 500);
    const off = boundedInteger(offset, 0, 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      count: entries.length, returned: entries.slice(off, off + lim).length,
      offset: off, limit: lim, free: true, gate: false,
      categories: Object.keys(categoryCounts).length, categoryCounts,
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
        // Cross-check: verify required fields before trusting
        if (!data || typeof data !== 'object') throw new Error('invalid body — not an object');
        if (!data.title || typeof data.title !== 'string') throw new Error('missing title');
        // provenance must be stated — no anonymous trust
        if (!data.provenance) data.provenance = 'unverified-submission';
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
        console.error('submit: invalid JSON body:', e.message);
        res.writeHead(400);
        res.end('invalid JSON');
      }
    });
    return;
  }

  // ── Gopher export (OG protocol integration) ──────────────────
  // Serves mindicraft entries as a Gopher menu — the OG way.
  // 整蠱唔使本 — no auth, no framework, just text.
  if (path === '/api/gopher') {
    const entries = loadIndex();
    const lines = [];
    lines.push('imindicraft — Gopher export (OG protocol, RFC 1436, 1991)\t\t\t\t1');
    lines.push('i' + '-'.repeat(67) + '\t\t\t\t1');
    lines.push(`iTotal entries: ${entries.length}\t\t\t\t1`);
    lines.push('i' + '-'.repeat(67) + '\t\t\t\t1');
    for (const e of entries.slice(0, 100)) {
      const title = (e.title || 'unknown').slice(0, 60);
      const cat = e.category || 'uncategorized';
      lines.push(`i[${cat}] ${title}\t\t\t\t1`);
      if (e.url) lines.push(`i  → ${e.url}\t\t\t\t1`);
    }
    lines.push('i' + '-'.repeat(67) + '\t\t\t\t1');
    lines.push('i整蠱唔使本 — Gopher has served since 1991.\t\t\t\t1');
    lines.push('.');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(lines.join('\r\n'));
    return;
  }

  // ── Finger export (OG protocol integration) ──────────────────
  if (path === '/api/finger') {
    const entries = loadIndex();
    const cats = {};
    for (const e of entries) { const c = e.category || 'unknown'; cats[c] = (cats[c] || 0) + 1; }
    const lines = [];
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('  mindicraft — finger @ the collector');
    lines.push('  整蠱唔使本 — serving since RFC 1288 (1991)');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Entries: ${entries.length}`);
    lines.push(`Categories: ${Object.keys(cats).length}`);
    lines.push(`Free: true | Gate: false | Auth: none | Love: true`);
    lines.push('');
    lines.push('─── Recent entries ───');
    for (const e of entries.slice(0, 10)) {
      lines.push(`  [${e.category || '?'}] ${e.title || 'unknown'}`);
    }
    lines.push('');
    lines.push('OGs never die. They just get rediscovered.');
    lines.push('═══════════════════════════════════════════════════════');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(lines.join('\r\n'));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mindicraft on http://localhost:${PORT}`);
  console.log(`Gopher: http://localhost:${PORT}/api/gopher`);
  console.log(`Finger: http://localhost:${PORT}/api/finger`);
  console.log(`API: http://localhost:${PORT}/api/index`);
  console.log(`Free. No gate. No auth. No tracking. Love is. 🐍❤️`);
});
