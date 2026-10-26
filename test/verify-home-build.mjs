import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const GUIDE = join(REPO, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const season = JSON.parse(read(join(GUIDE, 'season.json')));
const languages = JSON.parse(read(join(GUIDE, 'langs.json'))).languages;
const root = read(join(DIST, 'index.html'));
const today = new Date().toISOString().slice(0, 10);
const current = today <= season.check_by;

for (const language of languages) {
  const home = read(join(DIST, language.code, 'index.html'));
  const at = home.indexOf('<section class="season" id="season"');
  const pin = home.indexOf('<a class="season-pin" href="#season">');
  if (!current) {
    assert.equal(at, -1, `${language.code}: a season past ${season.check_by} must not be published`);
    assert.equal(pin, -1, `${language.code}: no pin for a season that came down`);
    continue;
  }
  // The door: wildfire help first, then the season's notice, then the title
  // page. The leaf itself follows the catalogue and comes before the shelves.
  const door = home.indexOf('class="wildfire-home-door"');
  assert.ok(door >= 0 && door < pin, `${language.code}: wildfire door stays first`);
  assert.ok(pin < home.indexOf('class="hero book-hero"'), `${language.code}: the season is pinned at the door`);
  assert.ok(at > home.indexOf('<section class="catalogue"'), `${language.code}: the catalogue comes before the leaf`);
  assert.ok(at < home.indexOf('id="contents"'), `${language.code}: the leaf comes before the shelves`);
  const leaf = home.slice(at, home.indexOf('</section>', at));
  const words = season.languages[language.code];
  assert.match(leaf, new RegExp(`data-check-by="${season.check_by}"`, 'u'));
  assert.match(leaf, /<p class="season-stale" role="note" hidden>/u);
  assert.match(leaf, /<svg viewBox="[^"]+" role="img" aria-labelledby="season-svg-title season-svg-desc">/u);
  assert.ok(leaf.includes(`href="${season.outlook.url}"`), `${language.code}: outlook source`);
  for (const source of season.carbon_monoxide_sources)
    assert.ok(leaf.includes(`href="${source.url}"`), `${language.code}: carbon monoxide source ${source.name}`);
  for (const place of words.places)
    for (const source of place.sources)
      assert.ok(leaf.includes(`href="${source.url}"`), `${language.code}: ${place.place} source`);
  // Every guide link opens a page that exists, in this language.
  const links = [...leaf.matchAll(/href="(\/[a-z]+\/[a-z-]+\/[a-z-]+\/)"/gu)].map((m) => m[1]);
  assert.ok(links.length >= season.print.length, `${language.code}: print links`);
  for (const link of links) {
    assert.ok(link.startsWith(`/${language.code}/`), `${language.code}: ${link} stays in its language`);
    assert.ok(existsSync(join(DIST, link, 'index.html')), `${language.code}: ${link} exists`);
  }
  // The stale check runs only after the leaf it reads, and takes the pin down.
  assert.match(home.slice(at), /<\/section>\n<script>\(\(\) => \{\n  const leaf = document\.getElementById\('season'\);/u);
  assert.match(home.slice(at), /const pin = document\.querySelector\('\.season-pin'\);\n  if \(pin\) pin\.hidden = true;/u);
  // Each reader opens their own place.
  assert.equal(leaf.split('<details><summary>').length - 1, words.places.length, `${language.code}: one fold per place`);
}

// The contents: every guide once per home, as a row the search and the
// System can find; the full cards stay on the domain pages.
const tree = JSON.parse(read(join(GUIDE, 'tree.json')));
const css = read(join(DIST, 'style.css'));
assert.match(css, /\.card\[hidden\], \.domain\[hidden\] \{ display: none; \}/u, 'search must be able to hide rows');
for (const language of languages) {
  const home = read(join(DIST, language.code, 'index.html'));
  for (const domain of tree.domains) {
    for (const guide of domain.guides) {
      const rows = home.split(`data-guide-card="${guide.slug}"`).length - 1;
      assert.equal(rows, 1, `${language.code}: ${guide.slug} appears once in the contents`);
    }
    const page = read(join(DIST, language.code, domain.key, 'index.html'));
    assert.match(page, /<div class="grid"><a class="card"/u, `${language.code}/${domain.key} keeps full cards`);
  }
  assert.match(home, /<ol class="toc"><li><a class="card" href=/u);
  assert.match(home, /c\.dataset\.search\.includes\(t\)/u);
}

// The hall: a plan with every shelf, shelf marks in tree order, and the way
// back. Marks are I·1, I·2 … on the home, the shelf pages and the guides.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
assert.ok(tree.domains.length <= ROMAN.length);
for (const language of languages) {
  const home = read(join(DIST, language.code, 'index.html'));
  const plan = home.slice(home.indexOf('<nav class="hall-plan" id="plan"'), home.indexOf('</nav>', home.indexOf('class="hall-plan"')));
  assert.ok(plan.length > 0, `${language.code}: plan of the hall`);
  assert.match(home, /document\.body\.classList\.toggle\('is-searching', !!t\);/u);
  // a mark finds exactly its guide: IV·3 never also finds XIV·3
  assert.match(home, /c\.dataset\.mark === mark\[1\] \+ '\.' \+ mark\[2\]/u);
  tree.domains.forEach((domain, di) => {
    const shelf = ROMAN[di];
    assert.ok(plan.includes(`<a href="#${domain.key}"><span class="bay-mark">${shelf}</span>`), `${language.code}: plan → ${domain.key}`);
    assert.ok(home.includes(`<section class="domain" id="${domain.key}">`), `${language.code}: ${domain.key} has its anchor`);
    const page = read(join(DIST, language.code, domain.key, 'index.html'));
    assert.ok(page.includes(`<p class="bay-kicker">${language.strings.hall.shelf} ${shelf}</p>`), `${language.code}/${domain.key}: shelf number`);
    const sep = ['zh', 'yue'].includes(language.code) ? '：' : ': ';
    if (di > 0) assert.ok(page.includes(`href="/${language.code}/${tree.domains[di - 1].key}/">${language.strings.hall.prevShelf}${sep}${ROMAN[di - 1]} · `), `${language.code}/${domain.key}: previous shelf`);
    if (di < tree.domains.length - 1) assert.ok(page.includes(`href="/${language.code}/${tree.domains[di + 1].key}/">${language.strings.hall.nextShelf}${sep}${ROMAN[di + 1]} · `), `${language.code}/${domain.key}: next shelf`);
    domain.guides.forEach((guide, gi) => {
      const mark = `<span class="shelfmark">${shelf}·${gi + 1}</span>`;
      const row = home.indexOf(`data-guide-card="${guide.slug}"`);
      assert.equal(home.indexOf(mark, row), home.indexOf('<span class="shelfmark"', row), `${language.code}: ${guide.slug} is ${shelf}·${gi + 1}`);
      assert.ok(home.slice(row, home.indexOf('>', row)).includes(`data-mark="${shelf.toLowerCase()}.${gi + 1}"`), `${language.code}: ${guide.slug} searchable by mark`);
      const path = join(DIST, language.code, domain.key, guide.slug, 'index.html');
      if (!existsSync(path)) return;
      const html = read(path);
      assert.ok(html.includes(`<p class="callno">${shelf}·${gi + 1}</p>`), `${path}: call number`);
      const shelfNav = html.slice(html.indexOf('<nav class="shelf"'));
      assert.equal(shelfNav.split('aria-current="page"').length - 1, 1, `${path}: this guide marked once on its shelf`);
      assert.equal(shelfNav.split('<li>').length - 1, domain.guides.length, `${path}: the whole shelf`);
    });
  });
}

// Night reading: a hidden button and a stored choice on pages that already run
// script; pages that promise no script stay without it and follow the system.
for (const language of languages) {
  for (const path of [
    join(DIST, language.code, 'index.html'),
    join(DIST, language.code, 'fire', 'spark-fire', 'index.html'),
  ]) {
    const html = read(path);
    assert.match(html, /<button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" title="[^"]+" hidden>/u, path);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /localStorage\.getItem\('mindicraft-theme'\)/u, `${path}: choice applied before paint`);
    assert.match(html, /localStorage\.setItem\('mindicraft-theme'/u, path);
  }
}
for (const path of [join(DIST, 'index.html'), join(DIST, 'wildfire', 'index.html')]) {
  const html = read(path);
  assert.doesNotMatch(html, /data-theme-toggle|mindicraft-theme/u, path);
}
assert.match(css, /:root\[data-theme="night"\] \{/u);
assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme="day"\]\) \{/u);
// Chinese on paper: Chrome on a Mac drops PingFang text from PDFs, so the
// print faces name ones that embed, and the diagram never asks for the UI face.
assert.match(css, /@media print \{\n  body, \.sv-label \{\n    font-family: [^;]*"Hiragino Sans GB"/u);
assert.match(css, /html\[lang="yue"\] body, html\[lang="yue"\] \.sv-label \{\n    font-family: [^;]*"Hiragino Sans CNS"/u);
for (const stack of css.slice(css.lastIndexOf('/* Faces for paper.')).match(/font-family:[^;]+;/gu).slice(0, 2))
  assert.doesNotMatch(stack, /PingFang/u, 'no PingFang on paper');
assert.doesNotMatch(css.match(/\.sv-label \{[^}]+\}/u)[0], /-apple-system/u, 'diagram labels use a face that embeds');
// Paper is always paper: the print palette comes after every night rule.
assert.ok(css.lastIndexOf('@media print {\n  :root:not([data-theme="print"]), :root[data-theme] {') > css.lastIndexOf('[data-theme="night"]'));

const entry = root.indexOf('class="season-entry"');
if (current) {
  assert.ok(entry > root.indexOf('class="wildfire-entry"') && entry < root.indexOf('class="root-cover"'));
  for (const language of languages) assert.ok(root.includes(`href="/${language.code}/#season"`), language.code);
} else {
  assert.equal(entry, -1, 'the cover must not point at a season that came down');
}
assert.doesNotMatch(root, /<script\b/u);

console.log(
  `verified the home pages: ${
    current
      ? `the season ahead (${season.id}) in ${languages.length} languages, sourced, comes down after ${season.check_by}`
      : `the season ahead (${season.id}) is off every page after ${season.check_by}`
  }; contents rows for every guide; a plan of the hall and shelf marks on every shelf and guide; night reading only where script already runs`
);
