// api/submit.js — submit a new entry. No auth. No gate.

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const INDEX_DIR = join(process.cwd(), 'index');

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const data = req.body || {};
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

  mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(join(INDEX_DIR, `${entry.id}.json`), JSON.stringify(entry, null, 2));
  res.status(200).json({ ok: true, id: entry.id });
}