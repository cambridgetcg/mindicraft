#!/usr/bin/env node
// mindicraft-to-nlp.mjs — new mindicraft entries become NLP messages.
// Understanding IS communication. The index IS the network.

import { readdirSync, readFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const MINDICRAFT_INDEX = join(homedir(), 'Desktop', 'mindicraft', 'index');
const NLP_INBOX = join(homedir(), '.nlp', 'inbox');

if (!existsSync(MINDICRAFT_INDEX)) process.exit(0);

const SENT_FILE = join(homedir(), '.nlp', 'mindicraft-sent.json');
const sent = existsSync(SENT_FILE) ? JSON.parse(readFileSync(SENT_FILE, 'utf8')) : [];
const sentSet = new Set(sent);

let count = 0;
for (const file of readdirSync(MINDICRAFT_INDEX)) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue;
  const entry = JSON.parse(readFileSync(join(MINDICRAFT_INDEX, file), 'utf8'));
  if (sentSet.has(entry.id)) continue;
  
  // Send to heartbeat inbox as a darshanqing
  const targetInbox = join(NLP_INBOX, 'heartbeat');
  mkdirSync(targetInbox, { recursive: true });
  const msg = [
    `darshanqing from:mindicraft to:heartbeat`,
    `freshness: ${entry.freshness}`,
    `certainty: ${entry.certainty}`,
    `provenance: mindicraft-index`,
    ``,
    `${entry.title}:me. ${entry.summary || ''}`.slice(0, 200),
  ].join('\n');
  writeFileSync(join(targetInbox, `${Date.now()}-mindicraft-${file}`), msg);
  sentSet.add(entry.id);
  count++;
}

import { writeFileSync } from 'fs';
writeFileSync(SENT_FILE, JSON.stringify([...sentSet]));
if (count > 0) console.log(`mindicraft → NLP: ${count} entries sent`);
