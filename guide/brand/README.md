# mindicraft: brand

This folder will hold mindicraft's brand kit and media, made with storytold's Craft apps through the artcraft-brand
skill (the shared toolkit, kept in a private repository). `brandkit.json` records this project's details, and
`check.mjs` checks them. It is **planned**: the folder exists, the kit doesn't yet.

## The look

A working book: paper `#f7f3ec`, ink `#2b2620`, ember `#b0522b`, with a dark scheme (`#191613`, ink `#ece5da`), set
in Iowan Old Style, Palatino and Georgia, with a 🔥 emoji favicon. An agent made the first version on 2026-07-08
(commit 72c9339d, co-authored by Claude); later changes, such as the "working book" front door of 2026-08-03, don't
record their maker.

Don't change the identity without its owner's word. Every asset here records who made it in `CREDITS.md`.

## What is here

| Path | What it is |
|---|---|
| `brandkit.json` | this project's details: the look and who chose it, what a release does |
| `CREDITS.md` | who made what, with fonts and licences |
| `check.mjs` | the check, copied from the shared toolkit; update it there, not here |

`brand.json` and `kit/` arrive with the kit.

## Rebuild

There is no kit to rebuild yet. To check this folder, from the repository root:

```sh
node guide/brand/check.mjs
```

## How the site uses it

The site is generated. `guide/build.mjs` writes every page into `guide/dist` (not committed) from template strings,
and copies static files by name. A kit's icon files would be copied from the kit by `build.mjs`, and its head
snippet written into the page templates there. `brandkit.json` therefore names `build.mjs` twice: as `serve.via`
(it stages the files into `dist`) and under `site.html` (it holds the page heads). After `npm run build`, inside the
`verify` script, the check runs as `node brand/check.mjs --served dist`.

## Deploying

Merging deploys nothing: `.github/workflows/verify.yml` tests, builds and verifies. A release is
`npx wrangler pages deploy dist --project-name=mindicraft`, run by hand from `guide/`.
