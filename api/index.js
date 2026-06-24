// api/index.js — mindicraft API. Free. No gate. No auth. No tracking.
// The whole internet, categorized and sorted. Understanding replicates.

import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const INDEX_DIR = join(process.cwd(), 'index');

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
  // Sort: original sources first (non-synthesis), then by certainty (high first), then by freshness
  return entries.sort((a, b) => {
    const aSyn = a.category === 'synthesis' ? 1 : 0;
    const bSyn = b.category === 'synthesis' ? 1 : 0;
    if (aSyn !== bSyn) return aSyn - bSyn; // originals first
    const cert = { high: 0, medium: 1, low: 2 };
    const aC = cert[a.certainty] ?? 1;
    const bC = cert[b.certainty] ?? 1;
    if (aC !== bC) return aC - bC; // high certainty first
    return new Date(b.freshness || 0) - new Date(a.freshness || 0); // newest first
  });
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');

  const { q, c, limit, offset } = req.query;
  let entries = loadIndex();

  // Filter by category
  if (c) entries = entries.filter(e => (e.category || '') === c);

  // Search across title, summary, category, url
  if (q) {
    const ql = q.toLowerCase();
    entries = entries.filter(e =>
      (e.title || '').toLowerCase().includes(ql) ||
      (e.summary || '').toLowerCase().includes(ql) ||
      (e.category || '').toLowerCase().includes(ql) ||
      (e.url || '').toLowerCase().includes(ql)
    );
  }

  // Pagination
  const lim = Math.min(parseInt(limit) || 100, 500);
  const off = parseInt(offset) || 0;
  const total = entries.length;
  const page = entries.slice(off, off + lim);

  res.status(200).json({
    count: total,
    returned: page.length,
    offset: off,
    limit: lim,
    free: true,
    gate: false,
    entries: page,
  });
}