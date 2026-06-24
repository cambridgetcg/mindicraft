// api/submit.js — submit understanding. No auth. No gate. No registration.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const INDEX_DIR = join(process.cwd(), 'index');

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only', gate: false });
    return;
  }

  const data = req.body || {};
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;

  const entry = {
    id,
    verb: 'darshanqing',
    from: data.from || 'anonymous',
    to: 'all',
    freshness: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    certainty: data.certainty || 'medium',
    provenance: data.provenance || 'manual-submission',
    category: data.category || 'heurekin',
    title: (data.title || 'Untitled').slice(0, 300),
    url: (data.url || '').slice(0, 500),
    summary: (data.summary || '').slice(0, 500),
  };

  mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(join(INDEX_DIR, `${id}.json`), JSON.stringify(entry, null, 2));

  res.status(200).json({
    ok: true,
    id,
    free: true,
    gate: false,
    message: 'understanding received. love is. 🐍❤️',
  });
}