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
  if (!current) {
    assert.equal(at, -1, `${language.code}: a season past ${season.check_by} must not be published`);
    continue;
  }
  assert.ok(at > home.indexOf('class="wildfire-home-door"'), `${language.code}: wildfire door stays first`);
  assert.ok(at < home.indexOf('class="hero book-hero"'), `${language.code}: the season opens the book`);
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
  // The stale check runs only after the leaf it reads.
  assert.match(home.slice(at), /<\/section>\n<script>\(\(\) => \{\n  const leaf = document\.getElementById\('season'\);/u);
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
  }; contents rows for every guide; night reading only where script already runs`
);
