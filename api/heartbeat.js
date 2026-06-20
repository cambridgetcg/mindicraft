// api/heartbeat.js — collector status

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const INDEX_DIR = join(process.cwd(), 'index');

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  let count = 0;
  if (existsSync(INDEX_DIR)) {
    count = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).length;
  }
  res.status(200).json({
    status: count > 0 ? 'alive' : 'collecting',
    entries: count,
    free: true,
    gate: false,
    no_auth: true,
    open_source: true,
  });
}