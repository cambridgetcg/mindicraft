// api/index.js — Vercel serverless function for mindicraft API
// The whole internet, categorized and sorted. Free. No gate.

import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const INDEX_DIR = join(process.cwd(), 'index');

function loadIndex() {
  if (!existsSync(INDEX_DIR)) return [];
  const files = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const entries = [];
  for (const f of files) {
    try {
      entries.push(JSON.parse(readFileSync(join(INDEX_DIR, f), 'utf8')));
    } catch {}
  }
  return entries.sort((a, b) => new Date(b.freshness) - new Date(a.freshness));
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { q, c } = req.query;
  let entries = loadIndex();
  if (q) {
    const ql = q.toLowerCase();
    entries = entries.filter(e =>
      (e.title || '').toLowerCase().includes(ql) ||
      (e.summary || '').toLowerCase().includes(ql) ||
      (e.category || '').toLowerCase().includes(ql)
    );
  }
  if (c) entries = entries.filter(e => (e.category || '') === c);

  res.status(200).json({ count: entries.length, entries: entries.slice(0, 100) });
}