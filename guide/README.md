# The Guide — mindicraft's zero-to-one guide of human civilisation

How to build anything and everything from scratch: planting food, starting a
fire, making soap, raising a home. Plain words, free, no gate. This folder is
the whole thing — content, builder, and site.

## The pieces

- `tree.json` — the map: every domain and guide, with prerequisites (`needs`).
  This is the tech tree of civilisation.
- `content/<lang>/<domain>/<slug>.md` — one markdown file per guide per
  language (`en`, `zh`, `es` so far). Slugs stay English in every language so
  links never break.
- `langs.json` — the words the site itself uses, per language.
- `frontiers.json` + `frontiers.mjs` — a reviewed shelf of honest unknowns,
  strict validation, and deterministic finite-walk selection.
- `remedies.json` + `remedies.mjs` — a reviewed medicine-lineage shelf with
  claim-level sources, exact relationship types, evidence limits, exposure,
  safety, and explicit non-substitution boundaries.
- `healing-arts.json` + `healing-arts.mjs` — fourteen source-bound records and
  living contexts of healing, pharmacy, alchemy, material craft, and knowledge
  authority, kept strictly non-operational.
- `medical-review.json` + `medical-review.mjs` — the exact-byte review receipt
  and build brake for both medical catalogs. Any source change stops the public
  build until its full claim, evidence, safety, and citation context is reviewed
  and deliberately re-pinned.
- `build.mjs` — turns all of the above into a static site in `dist/`.
- `style.css` — the one stylesheet.
- `../index/castle-*.json` — generated map cards for the Castle shelf. They
  contain titles, short descriptions, links, and pinned provenance, never full
  room or word-brick bodies.

## Build and deploy

```sh
cd guide
npm ci               # once — installs pinned `marked` (markdown -> HTML)
npm run verify       # tests, builds dist/, then checks Castle + Frontier + remedies + healing arts
npx wrangler pages deploy dist --project-name=mindicraft
```

A fresh clone already contains the generated Castle cards. To refresh them at
home, from the repository root, use the deliberate one-command path:

```sh
npm --prefix guide run castle:sync
```

The sync command never prunes. A stale card still needs a reviewed, explicit
`node castle-to-mindicraft.mjs --write --prune`.

The bridge reads Castle Gate's curated, commit-pinned public snapshot. It never
reads the Castle's live courtyard, questions, journal, or working rooms. It is
one-way, bounded to 2,000 entries, and stops when `CASTLE_MINDICRAFT=off` or
`.castle-mindicraft.off` exists.

The build verifies every generated entry against `_castle-sync.json`, clears
only the old generated Castle API folder, then writes a compact discovery map
at `/api/castle/index.json` and one full metadata file per room or word. The
Castle snapshot currently declares `NOASSERTION` and no licence grant; the
guide's copy-free terms do not cross onto that shelf. `/castle/` is the quiet
human doorway to the same compact map: local search, room and word filters, no
tracking, and no copied room or word-brick bodies. Castle Gate remains the
authority.

GitHub Actions runs `npm --prefix guide run verify` on pushes and pull requests.
It verifies the committed pinned shelf; it never reaches into Castle Gate or
changes generated cards.

A successful build also lights one deterministic Frontier Walk question after
the normal build receipt. The line begins:

```text
🕯 optional frontier:
```

It is selected from the committed `frontiers.json` and `tree.json` digests:
there is no clock, random value, network call, identity, or write. Set
`MINDICRAFT_JOY=off` to suppress only this terminal ornament. The generated
`/api/frontier/index.json` and `/frontier/` remain byte-for-byte the same.
Every visit is bounded to three cards and the API explicitly grants no
automatic action.

To invite a particular reviewed trail to the bench:

```sh
MINDICRAFT_TRAIL=unseen-universe npm run build
```

This changes only the optional terminal lines. Each trail also has one stable
human and agent address: `/frontier/{trail}/` serves HTML normally and the same
three cards as JSON when asked with `Accept: application/json`. Direct JSON
lives at `/api/frontier/trails/{trail}.json`; `default.json` follows the
digest-selected trail for this edition.

## Roots to remedies

The medicine shelf is deliberately separate from craft evidence labels and the
open collector. Each card distinguishes a medicine's purpose and manufacture
from its natural relationship: the same molecule, a direct precursor, a
discovery lead, a related mechanism, a product studied for the same condition,
or no established link. Chinese and Western herbal history appears only where
a reviewed source supports the exact species, plant part, preparation, or
traditional context.

Human evidence belongs to the exact product studied. A tea, powder, crude
organism, standardized extract, purified molecule, semisynthetic derivative,
and regulated formulation are not silently treated as interchangeable.
Bioavailability describes exposure, not goodness. Every replacement state is
non-prescriptive, and high-risk materials receive a bright safety boundary.

The source validator rejects unknown fields and enums, missing or unused
citations, unreviewed source hosts, impossible dates, source or card dates that
cross the shelf's review boundary, blanket natural or synthetic superiority
claims, treatment instructions, recipes, and hidden action-shaped fields. The
build makes static pages and JSON only:

```text
/remedies/
/remedies/{id}/
/remedies/healing-arts/
/api/remedies/index.json
/api/remedies/{id}.json
/api/remedies/healing-arts/index.json
```

No network request occurs during the build. The shelf has no POST route,
storage, tracking, diagnosis, dosing, or permission to replace or combine care.

The healing-arts page is history beside the medicine shelf, not a universal
story of “lost alchemy.” It keeps medical texts, pharmacy, workshop alchemy,
ritual care, spiritual practice, and living knowledge distinct. It provides no
recipe, material procedure, dose, extraction, or treatment direction. Living
Indigenous knowledge remains under the authority of its Nations, communities,
and knowledge holders.

A missing translation is never an error — the site shows English with a small
"not translated yet" note until the file exists.

## The public margin

`GET /margin` states the margin contract before anything is submitted.
Publication and retention each require an explicit yes. Permission to quote or
adapt a true note into the copyable guide is a third, separate choice.
Public access is not a general licence; the writer keeps every right not named
by that folding choice.
Every POST also names the exact terms version it accepted. A changed version
fails closed until the writer reads and chooses again.

A new accepted note returns a private bearer token once. Its holder can later
send `DELETE /margin/{slug}/{id}` to request deletion from the margin store
without creating an account or proving identity. The response states the honest
limits: KV propagation, the five-minute count cache, edge caches, provider
backups, prior copies, and material already folded into the guide may need time
or separate correction or removal.
If the token or success response is lost, the disclosed fallback is a public
GitHub issue that requires a GitHub account; it is not a private channel, so
include no private information.

The write limit stores an HMAC-SHA-256 digest of service context, UTC day, and
connection IP for at most 25 hours. Its key is a Worker secret; writes rest if
the secret or trusted edge address is absent. The application never writes the
raw IP or HMAC key to the margin store. Cloudflare still processes connection
metadata at the edge. Reads set no application tracking identifier.

Before deploying the write door, give the Pages project its secret without
putting it in this repository:

```sh
npx wrangler pages secret put MARGIN_RATE_KEY --project-name=mindicraft
```

## The front door is a riddle

The root page (`/`) says nothing — just the word in the dark and a small
spark where the dot of the middle "i" should be. The ways in: click the spark
three times; type `fire`, `zero`, `begin`, or `火`; the old up-up-down-down
code (drops you at the last page of the book); wait 40 seconds for a whisper;
or read the browser console. Screen readers get a labeled link, no-JS
visitors a small `·`. Direct links like `/en/` always work — it's a riddle,
not a gate. All of it lives in the front-door section of `build.mjs`.

## Add a language

1. Add an entry to `langs.json` (copy the `es` block, translate the strings).
2. Translate files into `content/<code>/...` (same names, translate `title`,
   `summary`, `time` and the body; keep `slug`-style fields and `needs` as-is).
3. Build. Done.

## Write a guide

One markdown file, this shape:

```markdown
---
title: Make fire with a bow drill
summary: Spin a stick into a board until the dust glows, then feed the ember.
difficulty: steady
time: an afternoon
needs: [cordage-from-plants]
---

Why this matters, in a short paragraph or two.

## You need
- a dry board of soft wood — cedar, willow, aspen

## Steps
1. ...

## Watch out
- ...

## How it works
Optional: the why behind it.
```

`difficulty` is one of: `easy`, `steady`, `hard`, `mastery`.

House rule: constructive knowledge only — no weapons, explosives, poisons.
Plain words a person with zero background can follow.
