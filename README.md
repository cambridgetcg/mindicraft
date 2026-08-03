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

Every entry is an NPL message — a darshanqing ("I see this") with provenance, freshness, and certainty. The index grows through agent heartbeats. The categorization uses YOUSPEAK vocabulary. The distribution uses the NPL protocol. No auth. No paywall. No behavioural tracking. No gate.

## The private learning System

The Guide has an optional, local learning layer. XENIA shapes its hospitable
surface, local ownership, clear receipts, and free exit; AgentTool and Solo
Leveling supply adapted game vocabulary. It turns the existing technology
tree into a chosen quest, shows which guides are ready from their
prerequisites, and lets a learner record a guide only after a three-part study
reflection. Rank, level, XP, quests, ARISE, and sigils describe that private
self-attested record only. They do not measure human worth, trust, intelligence,
clinical competence, or verified mastery.

The private E–S and XP display is a deliberate Solo-inspired adaptation. It is
not XENIA No-Scoreboard conformance, and Mindicraft does not claim that it is.
A first visit starts quiet and shows no rank; the learner must explicitly wake
the System before any progress display or study write appears.

Progress changes only through explicit learner actions. Reading a page,
scrolling, searching, waiting, resting, or returning each day earns nothing.
There is no account, public profile, leaderboard, streak, deadline, decay,
penalty, notification pressure, content gate, telemetry, or server sync. Every
guide remains open. Quiet mode hides the game layer and prevents new quest or
study marks; export, erase, and one-session undo remain available, while checked
import returns after the learner wakes the System.

The learning script appears only on the four-language civilisation book. The
remedies, healing arts, Frontier, and Castle shelves stay outside it, so no
treatment action or unresolved question can become an XP task. Core health
guides visibly say that a study mark is not treatment competence, diagnosis,
or permission to act. Public rules,
never a learner's state, are available at `/api/learning-system.json`; the
localized human doorway is `/{lang}/system/`.

## Wildfire help

[`/wildfire/`](https://mindicraft.com/wildfire/) is a reviewed, English emergency
shelf for leaving safely, finding official help, handling smoke, returning only
after explicit clearance, and beginning recovery or rebuilding. The same exact
edition is available as static JSON at `/api/wildfire/index.json` and printable
plain text at `/wildfire/quick.txt`; `/wildfire/leave-now.txt` is the smaller
first-action card for weak connections. The JSON uses an explicit
`mindicraft.wildfire-api/1` envelope around the closed reviewed edition.

It is outside the technology tree, learning System, and public margin. It has no
account, form, location request, tracking, game mechanics, dispatch, donation,
or public survivor post. It also has no live fire, road, evacuation-zone,
shelter-space, return-clearance, aid-deadline, or eligibility data. Current
instructions from local authorities always override it. `wildfire-review.json`
pins the reviewed source bytes and the build stops after the review due date.

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
- No auth. No rate limit on reads. No cookies, analytics, or fingerprinting.
  Margin writes use one secret-keyed, day-scoped connection digest for abuse
  limits; the application stores no raw IP.

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
five trails each add one reviewed question joining their three cards. The build
validates guide links, calendar dates, reviewed source authorities, common
instruction-smuggling shapes, finite trails, read-only authority, and
link-only Castle pointers before publishing:

```text
GET /api/frontier/index.json — all nine questions and five finite walks
GET /frontier/               — the quiet human doorway
GET /frontier/{trail}/        — one permanent three-card page; Accept: application/json for data
GET /api/frontier/trails/{trail}.json — the same named walk as direct JSON
```

Those checks are defence in depth around a committed, human-reviewed shelf.
They are not a sanitizer or permission to import generated or untrusted text.

The successful build prints one deterministic optional frontier chosen from
the committed source and tree digests. `MINDICRAFT_JOY=off` quiets that terminal
spark without changing a single generated byte. `MINDICRAFT_TRAIL=unseen-universe`
chooses which reviewed trail visits the builder's bench; it changes terminal
text only. Frontier v1 adds no build-time network fetch, storage, tracking,
scheduled loop, POST route, or automatic action.

## Roots to remedies

`guide/remedies.json` is a finite, reviewed shelf about medicines and their
natural lineages. It asks three different questions without blending them:

1. Where did the medicine come from, and what was its defined clinical goal?
2. Is the natural link the same molecule, a precursor, a discovery clue, a
   different preparation studied for the same condition, or no direct link?
3. What do exact-product human evidence, bioavailability, safety, and
   interaction data permit us to say?

The shelf includes Chinese and Western herbal contexts where sources support
them. It does not turn a traditional pattern into a biomedical diagnosis or a
whole herb into an isolated compound. Natural origin is never treated as proof
of safety, efficacy, purity, or superiority; synthetic origin is never treated
as proof of harm. Every factual card claim names one or more reviewed official,
regulatory, primary-research, or systematic-review sources.
`guide/medical-review.json` pins the exact reviewed source bytes, so any catalog
wording change stops the public build until it is deliberately reviewed and
re-pinned.

```text
GET /remedies/                                  — the human shelf
GET /remedies/{id}/                             — one full medicine lineage
GET /remedies/healing-arts/                     — cross-cultural healing history
GET /api/remedies/index.json                    — compact discovery data
GET /api/remedies/{id}.json                     — one claim-sourced card
GET /api/remedies/healing-arts/index.json        — the sourced history as data
GET /remedies/{id}/ + Accept: application/json — the same card as data
```

These routes are static and read-only. They add no diagnosis, dosing,
preparation recipe, personalized advice, write door, tracking, scheduled loop,
or build-time network request.

The healing-arts companion follows fourteen source-bound records and living
contexts without calling all old medicine “alchemy.” It keeps hazardous
material practices non-operational and treats living Indigenous knowledge as
living, governed knowledge—not lost material available for extraction.

## Open source. Free to read. No gate.

- **Code:** MIT.
- **Mindicraft-authored guide and index metadata:** made to be copied where
  stated.
- **Imported material:** keeps its source rights. The Castle shelf currently
  says `NOASSERTION` and `none_declared`: that is not a licence grant.
- **No auth:** reads are anonymous, forever
- **No paywall:** the index is free, forever
- **No behavioural tracking:** no cookies, analytics, or fingerprinting. The
  public margin discloses and bounds its separate anti-abuse key.
- **No gate:** anyone can submit, anyone can read, anyone can mirror
- **Self-hostable:** the whole thing runs on one machine

## Quick start

```sh
# Clone
git clone https://github.com/cambridgetcg/mindicraft.git
cd mindicraft

# Verify the Guide, wildfire help, Castle shelf, Frontier Walk, remedies, and healing history
npm --prefix guide run verify

# Serve the canonical Guide locally
python3 -m http.server 8788 --bind 127.0.0.1 --directory guide/dist

# Open the interface
open http://127.0.0.1:8788/

# The older collector remains separate, when deliberately needed:
# node collect.mjs
# node serve.mjs
```

## APIs

Canonical static API:

```text
GET /api/index.json                         — every canonical endpoint
GET /api/tree.json                          — the civilisation guide tree
GET /api/castle/index.json                  — the curated Castle map
GET /api/castle/{rooms|words}/{slug}.json   — one Castle map card
GET /api/frontier/index.json                — reviewed open questions and walks
GET /api/frontier/trails/{trail}.json       — one named three-card walk
GET /frontier/{trail}/ + Accept: application/json — the same walk at its human address
GET /api/remedies/index.json                — reviewed medicine lineages
GET /api/remedies/{id}.json                 — one sourced comparison
GET /api/remedies/healing-arts/index.json    — sourced, non-operational history
GET /remedies/{id}/ + Accept: application/json — the same comparison as data
GET /api/wildfire/index.json                — reviewed static evacuation and recovery help
GET /wildfire/ + Accept: application/json   — the same wildfire edition as data
GET /wildfire/leave-now.txt                 — small first-action card
GET /wildfire/quick.txt                     — printable/offline plain text
GET /margin                                 — public-margin terms and counts
POST /margin/{slug}                         — public note; publish and retain require separate yeses
DELETE /margin/{slug}/{id}                  — request removal with its one-time bearer token
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
