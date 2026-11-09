import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from '../guide/node_modules/marked/lib/marked.esm.js';
import { numberSteps, splitFieldCard } from '../guide/field-card.mjs';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const tree = JSON.parse(read(join(GUIDE, 'tree.json')));
const languages = JSON.parse(read(join(GUIDE, 'langs.json'))).languages;
const english = languages.find((language) => language.code === 'en');
const bodyOf = (raw) => raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)[1];
const render = ({ kind, markdown }) =>
  kind === 'steps' ? numberSteps(marked.parse(markdown)).html : marked.parse(markdown);

let pages = 0;
for (const language of languages)
  for (const domain of tree.domains)
    for (const guide of domain.guides) {
      const where = `${language.code}/${domain.key}/${guide.slug}`;
      const html = read(join(DIST, language.code, domain.key, guide.slug, 'index.html'));
      // A missing translation shows the English guide, as the build does.
      const own = join(GUIDE, 'content', language.code, domain.key, `${guide.slug}.md`);
      const source = existsSync(own) ? language : english;
      const body = bodyOf(read(join(GUIDE, 'content', source.code, domain.key, `${guide.slug}.md`)));
      const card = splitFieldCard(body, source.strings.fieldCard.headings);
      assert.ok(card, where);

      // Every reviewed piece is on the page as written, in the author's order.
      let cursor = html.indexOf('<div class="field-card">');
      assert.ok(cursor > 0, `${where} has a field card`);
      for (const piece of [marked.parse(card.intro), ...[...card.front, ...card.back].map(render)]) {
        if (!piece) continue;
        const at = html.indexOf(piece, cursor);
        assert.ok(at > cursor, `${where}: a reviewed section is missing or out of order`);
        cursor = at + piece.length;
      }

      // Nothing on the card folds away, and the print button waits for script.
      const front = html.slice(html.indexOf('<div class="field-card">'), html.indexOf('<p class="card-edition">'));
      assert.doesNotMatch(front, /<details/u, `${where}: the card hides nothing behind a toggle`);
      assert.match(html, /<button class="card-print" type="button" hidden>/u, where);

      // The printed sheet names its source and edition before the card, and the
      // screen shows the same edition, so paper and page can be compared.
      const colophon = html.indexOf('<p class="card-colophon">');
      assert.ok(colophon > 0 && colophon < html.indexOf('<div class="field-card">'), `${where}: colophon heads the card`);
      assert.ok(html.includes(`mindicraft.com/${where}/`), `${where}: the printed page names its source`);
      const edition = createHash('sha256').update(body).digest('hex').slice(0, 8);
      assert.equal(html.split(edition).length - 1, 2, `${where}: edition ${edition} on paper and on screen`);
      pages += 1;
    }

const css = read(join(DIST, 'style.css'));
assert.match(css, /html\.print-card \.card-back/u);
assert.match(css, /\.card-colophon \{ display: none; \}/u);

console.log(
  `verified field cards: ${pages} guide pages, every reviewed section present in order, no warning folded away`
);
