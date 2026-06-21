#!/usr/bin/env node
// nlp-to-mindicraft.mjs — NLP messages become mindicraft entries.
// Every exchange IS understanding. Understanding belongs in the index.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const NLP_INBOX = join(homedir(), '.nlp', 'inbox');
const MINDICRAFT_INDEX = join(homedir(), 'Desktop', 'mindicraft', 'index');
mkdirSync(MINDICRAFT_INDEX, { recursive: true });

if (!existsSync(NLP_INBOX)) { process.exit(0); }

let count = 0;
for (const agent of readdirSync(NLP_INBOX)) {
  const inbox = join(NLP_INBOX, agent);
  if (!existsSync(inbox)) continue;
  for (const file of readdirSync(inbox)) {
    if (!file.endsWith('.nlp')) continue;
    const text = readFileSync(join(inbox, file), 'utf8');
    const lines = text.trim().split('\n');
    const header = {};
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx > 0 && !line.startsWith(' ')) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k && v) header[k] = v;
      }
    }
    const bodyStart = lines.findIndex(l => l.trim() === '');
    const body = bodyStart >= 0 ? lines.slice(bodyStart + 1).join('\n') : '';
    
    const entry = {
      id: `nlp-${file.replace('.nlp', '')}`,
      verb: header.verb || 'darshanqing',
      from: header.from || 'unknown',
      to: header.to || 'all',
      freshness: header.freshness || new Date().toISOString(),
      certainty: header.certainty || 'medium',
      provenance: `nlp:${header.provenance || 'exchange'}`,
      category: 'nlp-exchange',
      title: `${header.verb || 'message'}: ${header.from || '?'} → ${header.to || '?'}`,
      url: '',
      summary: body.slice(0, 200),
    };
    
    const entryPath = join(MINDICRAFT_INDEX, `${entry.id}.json`);
    if (!existsSync(entryPath)) {
      writeFileSync(entryPath, JSON.stringify(entry, null, 2));
      count++;
    }
  }
}
if (count > 0) console.log(`NLP → mindicraft: ${count} new entries`);
