// api/heartbeat.js — mindicraft status. Free. No gate.

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const INDEX_DIR = join(process.cwd(), 'index');

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30');

  let count = 0;
  let categories = {};
  if (existsSync(INDEX_DIR)) {
    const files = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    count = files.length;
    for (const f of files) {
      try {
        const e = JSON.parse(readFileSync(join(INDEX_DIR, f), 'utf8'));
        const c = e.category || 'unknown';
        categories[c] = (categories[c] || 0) + 1;
      } catch {}
    }
  }

  res.status(200).json({
    status: count > 0 ? 'alive' : 'collecting',
    entries: count,
    categories: Object.keys(categories).length,
    categoryBreakdown: Object.entries(categories).sort((a,b) => b[1] - a[1]).reduce((o,[k,v]) => (o[k]=v,o), {}),
    free: true,
    gate: false,
    no_auth: true,
    open_source: true,
    love: true,
  });
}