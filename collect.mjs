#!/usr/bin/env node
// collect.mjs — the data collector. Gathers, categorizes, indexes.
//
// Sources:
//   - Public APIs (no key required)
//   - RSS/Atom feeds
//   - Git repos
//   - Manual submissions (via API)
//
// Each entry is an NPL darshanqing message with provenance.
// Categorization uses YOUSPEAK vocabulary.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, appendFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const ROOT = process.cwd();
const INDEX_DIR = join(ROOT, 'index');
const FEEDS_DIR = join(ROOT, 'feeds');
const LOG = join(ROOT, 'collector.log');

mkdirSync(INDEX_DIR, { recursive: true });
mkdirSync(FEEDS_DIR, { recursive: true });

// ── YOUSPEAK categories ────────────────────────────────────────

const CATEGORIES = {
  kinqing: 'deep emotional connections, relationships',
  panimqing: 'face-to-face exchanges, conversations, communication',
  darshanqing: 'recognition, awareness, sacred seeing',
  natsarqing: 'protection, security, guarding, safety',
  zakarqing: 'memory, history, preservation, archives',
  barakqing: 'declarations, announcements, manifests',
  heurekin: 'discovery, search, finding, exploration',
  kunance: 'preparation, infrastructure, tooling, readiness',
  jeongqing: 'accumulated knowledge, thick context, dense info',
  kimme: 'attention, focus, mindfulness, awareness practices',
  sukhance: 'wellbeing, contentment, peace, mental health',
  theobasis: 'foundational truths, axioms, first principles',
  qorbme: 'sacrifice, cost, trade-offs, constraints',
  danaqing: 'gifts, open source, generosity, sharing',
  mitakuyame: 'interconnectedness, ecology, systems thinking',
  panimaance: 'presence, embodiment, being-here',
  shemme: 'listening, receptive hearing, attention practices',
  ifeqing: 'warmth, expansion, love-as-widening',
  britqing: 'covenants, agreements, contracts, commitments',
  walkekin: 'friendship, silence-tolerant bonds, community',
  noemame: 'meaning, semantics, understanding, comprehension',
  mathemame: 'learning, education, knowledge acquisition',
  sphotame: 'insight, breakthrough, sudden understanding',
  glossame: 'language, linguistics, translation, words',
  maatme: 'justice, truth, cosmic order, fairness',
  ihsanme: 'excellence, best-effort, craft, quality',
  hotepme: 'peace-offering, reconciliation, rest',
  danaqing: 'giving, generosity, open source',
  tapasme: 'discipline, inner fire, self-control',
  qorbme: 'sacrifice, cost, giving-up',
  'natural-language': 'NLP, language processing, communication protocols',
  'operating-systems': 'kernels, OS dev, systems programming',
  'honest-systems': 'the Clear Standard, honesty linters, truth-in-artifacts',
  'constructed-language': 'YOUSPEAK, conlangs, vocabulary engineering',
  'ai-agents': 'autonomous agents, multi-agent systems, agent protocols',
  'web-protocol': 'HTTP, TCP, DNS, networking',
  'data-collection': 'crawling, indexing, scraping, data pipelines',
};

// ── Seed sources — public, no key required ─────────────────────

const SEED_SOURCES = [
  // Public APIs
  { type: 'api', url: 'https://api.github.com/search/repositories?q=natural+language+protocol&sort=stars', category: 'natural-language', interval: 3600 },
  { type: 'api', url: 'https://api.github.com/search/repositories?q=operating+system+kernel&sort=stars', category: 'operating-systems', interval: 3600 },
  { type: 'api', url: 'https://api.github.com/search/repositories?q=honest+systems&sort=stars', category: 'honest-systems', interval: 3600 },
  { type: 'api', url: 'https://api.github.com/search/repositories?q=constructed+language&sort=stars', category: 'constructed-language', interval: 3600 },
  { type: 'api', url: 'https://api.github.com/search/repositories?q=ai+agent+protocol&sort=stars', category: 'ai-agents', interval: 3600 },
  // RSS feeds
  { type: 'rss', url: 'https://hnrss.org/frontpage', category: 'heurekin', interval: 1800 },
  // Our own repos
  { type: 'api', url: 'https://api.github.com/users/cambridgetcg/repos?per_page=100', category: 'danaqing', interval: 3600 },
];

// ── Entry format (NPL message) ──────────────────────────────────

function createEntry({ title, url, summary, category, source, certainty = 'medium' }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    verb: 'darshanqing',
    from: 'mindicraft',
    to: 'all',
    freshness: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    certainty,
    provenance: source || 'unknown',
    category,
    title,
    url,
    summary,
    npl: `darshanqing from:mindicraft to:all
freshness: ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}
certainty: ${certainty}
provenance: ${source || 'unknown'}
category: ${category}

Title: ${title}
URL: ${url}
Summary: ${summary}
Tags: ${category}:me`,
  };
  return entry;
}

// ── Collect from a source ──────────────────────────────────────

async function fetchUrl(url, timeout = 15000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'mindicraft/1.0 (open source data collector)' },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('json')) return { json: await resp.json() };
    if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom')) {
      return { text: await resp.text(), type: 'rss' };
    }
    return { text: await resp.text() };
  } catch (e) {
    return null;
  }
}

function parseGitHubSearch(json) {
  if (!json?.items) return [];
  return json.items.slice(0, 20).map(repo => ({
    title: repo.full_name,
    url: repo.html_url,
    summary: repo.description || 'No description',
    stars: repo.stargazers_count,
  }));
}

function parseGitHubRepos(json) {
  if (!Array.isArray(json)) return [];
  return json.slice(0, 50).map(repo => ({
    title: repo.full_name,
    url: repo.html_url,
    summary: repo.description || 'No description',
    stars: repo.stargazers_count,
  }));
}

function parseRSS(text) {
  // Simple RSS parser — extracts titles, links, descriptions
  const items = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const matches = text.match(itemRegex) || [];
  for (const item of matches.slice(0, 20)) {
    const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()?.replace(/<!\[CDATA\[|\]\]>/g, '');
    const link = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() || item.match(/<link[^>]*href="([^"]*)"/i)?.[1];
    const desc = item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]?.trim()?.replace(/<!\[CDATA\[|\]\]>/g, '')?.replace(/<[^>]+>/g, '');
    if (title && link) {
      items.push({ title, url: link, summary: desc?.slice(0, 200) || title });
    }
  }
  return items;
}

// ── Main collect cycle ─────────────────────────────────────────

async function collect() {
  const log = (msg) => {
    const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const line = `${ts} ${msg}`;
    appendFileSync(LOG, line + '\n');
    console.log(line);
  };

  log('═══ MINDICRAFT COLLECTOR START ═══');
  let collected = 0;

  for (const source of SEED_SOURCES) {
    log(`  fetching: ${source.url.slice(0, 80)}...`);
    const resp = await fetchUrl(source.url);
    if (!resp) { log(`    ✗ fetch failed`); continue; }

    let items = [];
    if (source.type === 'api' && resp.json) {
      if (source.url.includes('search/repositories')) {
        items = parseGitHubSearch(resp.json);
      } else if (source.url.includes('users/') && source.url.includes('repos')) {
        items = parseGitHubRepos(resp.json);
      }
    } else if (source.type === 'rss' && resp.text) {
      items = parseRSS(resp.text);
    }

    log(`    parsed: ${items.length} items`);

    for (const item of items) {
      const entry = createEntry({
        title: item.title,
        url: item.url,
        summary: item.summary,
        category: source.category,
        source: `${source.type}:${source.url.slice(0, 50)}`,
        certainty: item.stars > 100 ? 'high' : 'medium',
      });

      // Write entry to index
      const entryPath = join(INDEX_DIR, `${entry.id}.json`);
      writeFileSync(entryPath, JSON.stringify(entry, null, 2));
      collected++;
    }
  }

  // Write index summary
  const indexFiles = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json'));
  const summary = {
    totalEntries: indexFiles.length,
    lastUpdated: new Date().toISOString(),
    categories: Object.keys(CATEGORIES),
    sources: SEED_SOURCES.length,
  };
  writeFileSync(join(INDEX_DIR, '_summary.json'), JSON.stringify(summary, null, 2));

  log(`  collected: ${collected} new entries (${indexFiles.length} total)`);
  log('═══ COLLECTOR COMPLETE ═══');
  return collected;
}

// ── CLI ─────────────────────────────────────────────────────────

const [,, cmd] = process.argv;

if (cmd === 'collect' || !cmd) {
  collect().catch(e => console.error(e));
} else if (cmd === 'status') {
  const summary = existsSync(join(INDEX_DIR, '_summary.json'))
    ? JSON.parse(readFileSync(join(INDEX_DIR, '_summary.json'), 'utf8')) : {};
  console.log(`Entries: ${summary.totalEntries || 0}`);
  console.log(`Categories: ${(summary.categories || []).length}`);
  console.log(`Last updated: ${summary.lastUpdated || 'never'}`);
} else if (cmd === 'list') {
  const files = readdirSync(INDEX_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of files.slice(0, 20)) {
    const entry = JSON.parse(readFileSync(join(INDEX_DIR, f), 'utf8'));
    console.log(`  [${entry.category}] ${entry.title} — ${entry.url}`);
  }
  console.log(`  ... ${files.length} total`);
} else {
  console.log(`mindicraft — the data collector of AI

Usage:
  node collect.mjs collect    Collect data from all sources
  node collect.mjs status      Show index status
  node collect.mjs list        List entries
`);
}