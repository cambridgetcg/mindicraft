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
- `build.mjs` — turns all of the above into a static site in `dist/`.
- `style.css` — the one stylesheet.

## Build and deploy

```sh
cd guide
npm install          # once — brings in `marked` (markdown -> HTML)
node build.mjs       # writes dist/
npx wrangler pages deploy dist --project-name=mindicraft
```

A missing translation is never an error — the site shows English with a small
"not translated yet" note until the file exists.

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
