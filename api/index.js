// api/index.js — mindicraft API. Free. No gate. No auth. No tracking.
// The whole internet, categorized and sorted. Understanding replicates.

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const INDEX_DIR = join(process.cwd(), 'index');

function boundedInteger(value, fallback, min, max = Number.MAX_SAFE_INTEGER) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  if (!/^[+-]?\d+$/.test(String(raw).trim())) return fallback;
  const parsed = Number(raw);
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
  const origin = req.query.from;
  let entries = loadIndex();

  if (origin) entries = entries.filter(e => (e.from || '') === origin);

  // Search meaningful metadata only. Hostnames are transport, not understanding.
  if (q) {
    const ql = String(Array.isArray(q) ? q[0] : q).toLowerCase();
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

  // Pagination
  const lim = boundedInteger(limit, 100, 1, 500);
  const off = boundedInteger(offset, 0, 0);
  const total = entries.length;
  const page = entries.slice(off, off + lim);

  res.status(200).json({
    count: total,
    returned: page.length,
    offset: off,
    limit: lim,
    free: true,
    gate: false,
    categories: Object.keys(categoryCounts).length,
    categoryCounts,
    entries: page,
  });
}
