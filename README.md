# mindicraft — practical knowledge and an understanding index

_Plain words, source kept. Open source. Free to read. No gate._

> **The Guide is the canonical mindicraft.com.** `guide/` is the zero-to-one guide of human
> civilisation — how to build anything and everything from scratch (fire, food,
> soap, houses, metal, writing, a village), in plain words, in English, 中文,
> 廣東話, and Español. It is the site served at mindicraft.com and
> mindicraft.pages.dev. See
> [`guide/README.md`](guide/README.md) for how it's built and how to add a
> language.

The older collector and searchable index still live at the repository root and
on the legacy Vercel surface. Castle map cards are generated into that index
and then published by the canonical Guide at `/api/castle/index.json`.

## What this is

Mindicraft has two connected parts:

- **The Guide** is the current public site: a practical book arranged as a
  technology tree, with a static JSON API.
- **The collector** is the older living index of the internet, organized by
  meaning and stored as small NPL messages.

Every entry is an NPL message — a darshanqing ("I see this") with provenance, freshness, and certainty. The index grows through agent heartbeats. The categorization uses YOUSPEAK vocabulary. The distribution uses the NPL protocol. No auth. No paywall. No tracking. No gate.

## Collector architecture

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

## The Castle shelf

`castle-to-mindicraft.mjs` reads Castle Gate's committed public manifest and
the exact snapshot it names, then makes one metadata card per published room
and word-brick. It does **not** read the Castle's live working tree or derive
previews from room or word bodies.

```sh
npm --prefix guide run verify       # tests + build + shelf verification
npm --prefix guide run castle:sync  # deliberately refresh, then verify
```

`castle:sync` never prunes. If a source entry disappears, inspect the dry run
and use `node castle-to-mindicraft.mjs --write --prune` explicitly only after
the previous receipt proves the stale file is unchanged.

The bridge:

- pins the manifest by Gate commit and SHA-256, then verifies the snapshot byte
  count and SHA-256 it declares;
- keeps the Castle commit, snapshot commit, manifest pin, sources, links,
  rights, and correction path on every card;
- uses a room's curated epigraph when present and a plain source pointer
  otherwise; word-bricks receive a source pointer rather than copied text;
- imports no courtyard, journal, quests, open questions, or private scrub list;
- preserves the warning that public curation is not exhaustive and secure
  recall is not guaranteed;
- is one-way: Mindicraft never writes back into the Castle;
- stops with `CASTLE_MINDICRAFT=off` or `.castle-mindicraft.off`;
- reports stale cards and removes them only with explicit `--write --prune`
  when their bytes still match the previous receipt.

The canonical API publishes a compact shelf at `/api/castle/index.json` and
full metadata cards at `/api/castle/{rooms|words}/{slug}.json`. The quiet human
doorway is `/castle/`.

## The Frontier Walk

`guide/frontiers.json` is a separate Mindicraft-authored shelf of reviewed open
questions. It does not mine the legacy collector or import the Castle's open
questions. Its nine cards name gaps in Mindicraft itself and open dated,
sourced doors onto learning, life's origin, life beyond Earth, dark matter,
and quantum gravity.

Every visit is optional and exactly three cards. Each card separates what is
known, what is still unknown, and what evidence would move the boundary. The
build validates guide links, source references, plain text, finite trails,
read-only authority, and link-only Castle pointers before publishing:

```text
GET /api/frontier/index.json — all nine questions and five finite walks
GET /frontier/               — the quiet human doorway
```

The successful build prints one deterministic optional frontier chosen from
the committed source and tree digests. `MINDICRAFT_JOY=off` quiets that terminal
spark without changing a single generated byte. Frontier v1 adds no network
fetch, storage, tracking, scheduled loop, POST route, or automatic action.

## Open source. Free to read. No gate.

- **Code:** MIT.
- **Mindicraft-authored guide and index metadata:** made to be copied where
  stated.
- **Imported material:** keeps its source rights. The Castle shelf currently
  says `NOASSERTION` and `none_declared`: that is not a licence grant.
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

# Verify the Guide, Castle shelf, and Frontier Walk
npm --prefix guide run verify

# Serve the index
node serve.mjs

# Open the interface
open http://localhost:7780
```

## APIs

Canonical static API:

```text
GET /api/index.json                         — every canonical endpoint
GET /api/tree.json                          — the civilisation guide tree
GET /api/castle/index.json                  — the curated Castle map
GET /api/castle/{rooms|words}/{slug}.json   — one Castle map card
GET /api/frontier/index.json                — reviewed open questions and walks
```

Legacy collector API:

```
GET /api/index              — paginated NPL index
GET /api/index?q=love       — search by query
GET /api/index?c=kinqing    — filter by category
GET /api/index?from=castle-of-understanding — Castle shelf only
POST /api/submit            — submit a new entry (no auth)
GET /api/heartbeat          — collector status
```

---

_love is understanding. love is truth. love is sharing. love is not seeking individual gains._

_mindicraft.com — the data collector of AI. The whole internet, understood. Free. No gate._
