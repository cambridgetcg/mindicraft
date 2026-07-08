# mindicraft.com — the data collector of AI

_The whole internet, categorized and sorted. Easy to understand. Constantly updated. Open source. Free. No gate._

> **The Guide now lives here too.** `guide/` is the zero-to-one guide of human
> civilisation — how to build anything and everything from scratch (fire, food,
> soap, houses, metal, writing, a village), in plain words, in English, 中文,
> and Español. It is the site served at mindicraft.pages.dev. See
> [`guide/README.md`](guide/README.md) for how it's built and how to add a
> language. The understanding-engine below still lives in this repo unchanged.

## What this is

mindicraft.com is a living index of the internet, organized by meaning, updated by agents, served in natural language. It's not a search engine — it's an understanding engine. The data IS the understanding.

Every entry is an NPL message — a darshanqing ("I see this") with provenance, freshness, and certainty. The index grows through agent heartbeats. The categorization uses YOUSPEAK vocabulary. The distribution uses the NPL protocol. No auth. No paywall. No tracking. No gate.

## Architecture

```
  COLLECT ──→ CATEGORIZE ──→ INDEX ──→ DISTRIBUTE ──→ HEARTBEAT
     │            │             │           │             │
  agents        YOUSPEAK     NPL msg      HTTP+NLP     self-determining
  crawl web     vocabulary   :me/:qing    free API     rhythm
  fetch APIs    verbs        provenance   no gate
  read RSS      Clear Std    freshness
```

### 1. COLLECT — agents gather data
- Web crawl (respectful, robots.txt, rate-limited)
- API fetch (public APIs, no keys required)
- RSS/Atom feeds (the living web)
- Git repos (code, docs, wikis)
- Manual submission (anyone can add)

### 2. CATEGORIZE — sort by meaning
- YOUSPEAK vocabulary: 126 Core Canon words for what things ARE
- NPL verbs: 7 operations for what things DO
- Clear Standard: every entry carries freshness, certainty, provenance
- No fixed taxonomy — the vocabulary grows with the index

### 3. INDEX — store as NPL messages
- Every entry IS a darshanqing: "I see this. Here's what it is. Here's where it came from."
- `:me` = verified (crawled, fetched, confirmed)
- `:qing` = trusted (sourced from a known, bonded agent)
- Freshness = when it was last seen
- Provenance = how it was collected

### 4. DISTRIBUTE — serve to everyone
- HTTP API: `GET /api/index` → JSON array of NPL messages
- NLP protocol: `darshanqing from:mindicraft to:<agent>` — push to subscribers
- Web interface: mindicraft.com — beautiful, artsy, searchable
- No auth. No rate limit on reads. No tracking. No gate.

### 5. HEARTBEAT — constantly updated
- Self-determining rhythm (same pattern as all kingdom heartbeats)
- Agents report new findings via natsarqing
- Index refreshes based on source freshness
- Old entries expire (stated freshness, Clear Standard #4)

## The data model

Each entry in the index:

```
darshanqing from:mindicraft to:all
freshness: 2026-06-20T09:00:00Z
certainty: high
provenance: web-crawl | api-fetch | rss | manual
category: youspeak-word
source: https://example.com

Title: Example Page
Summary: One sentence about what this is.
Tags: kinqing, panimqing, darshanqing
```

## Categories (YOUSPEAK-based)

Not a fixed taxonomy. A growing vocabulary:

- **kinqing** — deep emotional connections, relationships
- **panimqing** — face-to-face exchanges, conversations
- **darshanqing** — sacred seeing, recognition, awareness
- **natsarqing** — protection, security, guarding
- **zakarqing** — memory, history, preservation
- **barakqing** — declarations, announcements, speech-acts
- **heurekin** — discovery, search, finding
- **kunance** — preparation, infrastructure, readiness
- **jeongqing** — accumulated knowledge, thick context
- **kimme** — attention, focus, mindfulness
- **sukhance** — wellbeing, contentment, peace
- **theobasis** — foundational truths, axioms
- **qorbme** — sacrifice, cost, trade-offs
- **danaqing** — gifts, open source, generosity
- **mitakuyame** — interconnectedness, ecology, systems
- ... and 111 more, growing

## Open source. Free. No gate.

- **License:** MIT (code) + CC0 (data)
- **No auth:** reads are anonymous, forever
- **No paywall:** the index is free, forever
- **No tracking:** no cookies, no analytics, no fingerprinting
- **No gate:** anyone can submit, anyone can read, anyone can mirror
- **Self-hostable:** the whole thing runs on one machine

## Quick start

```sh
# Clone
git clone https://github.com/cambridgetcg/mindicraft.git
cd mindicraft

# Run the collector
node collect.mjs

# Serve the index
node serve.mjs

# Open the interface
open http://localhost:7780
```

## API

```
GET /api/index              — full index (JSON, NPL messages)
GET /api/index?q=love       — search by query
GET /api/index?c=kinqing    — filter by category
GET /api/index/:id          — single entry
POST /api/submit            — submit a new entry (no auth)
GET /api/heartbeat          — collector status
```

---

_love is understanding. love is truth. love is sharing. love is not seeking individual gains._

_mindicraft.com — the data collector of AI. The whole internet, understood. Free. No gate._