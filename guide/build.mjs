// Mindicraft guide builder — turns the markdown guides into a static site.
//
//   content/<lang>/<domain>/<slug>.md  --->  dist/<lang>/<domain>/<slug>/index.html
//
// Run once:  npm install   (or: bun install)   — brings in `marked` (markdown -> HTML)
// Build:     node build.mjs
// Deploy:    npx wrangler pages deploy dist --project-name=mindicraft
//
// The map of everything is tree.json (domains -> guides, with prerequisites).
// UI words for every language live in langs.json. Adding a language = one new
// entry in langs.json + translated files under content/<code>/. Nothing else.

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { buildLantern, prepareFrontiers } from './frontiers.mjs';
import { prepareHealingArts } from './healing-arts.mjs';
import { LEARNING_SYSTEM, createLearningEngine } from './learning-system.mjs';
import { assertMedicalReview } from './medical-review.mjs';
import { prepareRemedies } from './remedies.mjs';
import { prepareWildfireHelp } from './wildfire.mjs';
import { assertWildfireReview } from './wildfire-review.mjs';
import { MARGIN_TERMS } from './xenia-worker.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const MINDICRAFT_ROOT = dirname(ROOT);
const MINDICRAFT_INDEX = join(MINDICRAFT_ROOT, 'index');
const BUILD_DATE = new Date().toISOString().slice(0, 10);

const TREE_BYTES = readFileSync(join(ROOT, 'tree.json'));
const FRONTIER_SOURCE_BYTES = readFileSync(join(ROOT, 'frontiers.json'));
const HEALING_ARTS_SOURCE_BYTES = readFileSync(join(ROOT, 'healing-arts.json'));
const REMEDY_SOURCE_BYTES = readFileSync(join(ROOT, 'remedies.json'));
const WILDFIRE_SOURCE_BYTES = readFileSync(join(ROOT, 'wildfire.json'));
const MEDICAL_REVIEW = JSON.parse(
  readFileSync(join(ROOT, 'medical-review.json'), 'utf8')
);
assertMedicalReview(MEDICAL_REVIEW, {
  'remedies.json': REMEDY_SOURCE_BYTES,
  'healing-arts.json': HEALING_ARTS_SOURCE_BYTES,
});
const WILDFIRE_REVIEW_RECEIPT = JSON.parse(
  readFileSync(join(ROOT, 'wildfire-review.json'), 'utf8')
);
assertWildfireReview(
  WILDFIRE_REVIEW_RECEIPT,
  { 'wildfire.json': WILDFIRE_SOURCE_BYTES },
  { today: BUILD_DATE }
);
const tree = JSON.parse(TREE_BYTES.toString('utf8'));
createLearningEngine(tree); // fail closed before generating pages or public rules
const langs = JSON.parse(readFileSync(join(ROOT, 'langs.json'), 'utf8')).languages;
// evidence.json: slug -> { state: 'hand-tested', evidence: [...] } — filled as
// margin notes from real hands are verified. Absent slug = tradition-asserted.
const evidence = JSON.parse(readFileSync(join(ROOT, 'evidence.json'), 'utf8'));
const evidenceOf = (slug) => (evidence[slug]?.state === 'hand-tested' ? 'hand-tested' : 'tradition-asserted');

// ---------- small helpers ----------

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Frontmatter: the block between the first two `---` lines.
// Lines are `key: value`; a value like [a, b, c] becomes an array.
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      meta[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      meta[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: m[2] };
}

function write(path, html) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
}

// ---------- index the tree ----------

// slug -> { domain, guide } for linking prerequisites across domains
const bySlug = new Map();
for (const domain of tree.domains)
  for (const guide of domain.guides) bySlug.set(guide.slug, { domain, guide });
const TOTAL = bySlug.size;

// slug -> [slugs it unlocks] (the reverse of `needs`)
const unlocks = new Map();
for (const domain of tree.domains)
  for (const guide of domain.guides)
    for (const need of guide.needs || []) {
      if (!unlocks.has(need)) unlocks.set(need, []);
      unlocks.get(need).push(guide.slug);
    }

// ---------- load content (with English fallback for missing translations) ----------

// content[lang code][slug] = { meta, body }
const content = {};
const missing = {}; // lang -> [paths] — reported at the end, never fatal
for (const lang of langs) {
  content[lang.code] = {};
  missing[lang.code] = [];
  for (const domain of tree.domains)
    for (const guide of domain.guides) {
      const path = join(ROOT, 'content', lang.code, domain.key, `${guide.slug}.md`);
      if (existsSync(path)) content[lang.code][guide.slug] = parseFrontmatter(readFileSync(path, 'utf8'));
      else missing[lang.code].push(`${lang.code}/${domain.key}/${guide.slug}.md`);
    }
}

const FRONTIER_FACT_IDS = new Set([
  'guide-count',
  'needs-edge-count',
  'language-count',
  'missing-translation-count',
  'evidence-record-count',
  'hand-tested-count',
]);
const FRONTIERS = prepareFrontiers(
  JSON.parse(FRONTIER_SOURCE_BYTES.toString('utf8')),
  {
    guideSlugs: new Set(bySlug.keys()),
    factIds: FRONTIER_FACT_IDS,
    sourceBytes: FRONTIER_SOURCE_BYTES,
    treeBytes: TREE_BYTES,
  }
);
const REMEDIES = prepareRemedies(
  JSON.parse(REMEDY_SOURCE_BYTES.toString('utf8')),
  { sourceBytes: REMEDY_SOURCE_BYTES }
);
const HEALING_ARTS = prepareHealingArts(
  JSON.parse(HEALING_ARTS_SOURCE_BYTES.toString('utf8')),
  { sourceBytes: HEALING_ARTS_SOURCE_BYTES }
);
const WILDFIRE = prepareWildfireHelp(
  JSON.parse(WILDFIRE_SOURCE_BYTES.toString('utf8')),
  { sourceBytes: WILDFIRE_SOURCE_BYTES, today: BUILD_DATE }
);

// Shared public sources may use different kind vocabularies in the two
// schemas, but their identity must not drift between shelves.
const healingSourceByUrl = new Map(
  HEALING_ARTS.source.sources.map((source) => [source.url, source])
);
const healingSourceById = new Map(
  HEALING_ARTS.source.sources.map((source) => [source.id, source])
);
for (const remedySource of REMEDIES.sources) {
  const sameId = healingSourceById.get(remedySource.id);
  if (sameId) {
    for (const field of ['title', 'publisher', 'url', 'observed_at']) {
      if (remedySource[field] !== sameId[field]) {
        throw new Error(
          `Shared remedy/healing source id names different records: ${remedySource.id} (${field})`
        );
      }
    }
  }
  const healingSource = healingSourceByUrl.get(remedySource.url);
  if (!healingSource) continue;
  for (const field of ['title', 'publisher', 'observed_at']) {
    if (remedySource[field] !== healingSource[field]) {
      throw new Error(
        `Shared remedy/healing source metadata drifted at ${remedySource.url}: ${field}`
      );
    }
  }
}

// ---------- page pieces ----------

const langSwitch = (currentCode, pathAfterLang) =>
  `<nav class="langs">${langs
    .map((l) =>
      l.code === currentCode
        ? `<span class="lang on" aria-current="page">${esc(l.name)}</span>`
        : `<a class="lang" href="/${l.code}/${pathAfterLang}">${esc(l.name)}</a>`
    )
    .join('')}</nav>`;

const safeScriptJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');

function page({
  lang,
  title,
  path,
  body,
  head = '',
  learning = null,
  description = null,
  showLanguageSwitch = true,
}) {
  const S = lang.strings;
  const learningWords = S.learningSystem;
  const learningAttrs = learning
    ? [
        ` data-learning-page="${esc(learning.kind)}"`,
        learning.guide ? ` data-guide-id="${esc(learning.guide)}"` : '',
        learning.domain ? ` data-domain-id="${esc(learning.domain)}"` : '',
        learning.difficulty
          ? ` data-guide-difficulty="${esc(learning.difficulty)}"`
          : '',
      ].join('')
    : '';
  const learningDoor = learning
    ? `<a class="system-door" data-system-door href="/${lang.code}/system/">⚔ ${esc(
        learningWords.nav
      )}</a>`
    : '';
  const learningClient = learning
    ? `<script id="learning-words" type="application/json">${safeScriptJson(
        { ...learningWords, difficultyWords: S.difficultyWords }
      )}</script>
<script type="module" src="/learning-ui.mjs"></script>`
    : '';
  return `<!doctype html>
<html lang="${lang.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(S.siteTitle)}</title>
<meta name="description" content="${esc(description || S.tagline)}">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>">
${head}
</head>
<body${learningAttrs}>
<header class="top">
  <a class="brand" href="/${lang.code}/">${esc(S.siteTitle)}</a>
  <div class="top-actions">${showLanguageSwitch ? langSwitch(lang.code, path) : ''}${learningDoor}</div>
</header>
<main>
${body}
</main>
<footer class="foot">${esc(S.footer)}</footer>
${learningClient}
</body>
</html>`;
}

const diffChip = (S, d) =>
  d ? `<span class="chip diff-${esc(d)}">${esc(S.difficultyWords[d] || d)}</span>` : '';

const guideCard = (lang, domain, guide) => {
  const S = lang.strings;
  const local = content[lang.code][guide.slug]?.meta || {};
  return `<a class="card" href="/${lang.code}/${domain.key}/${guide.slug}/" data-guide-card="${esc(
    guide.slug
  )}" data-domain-id="${esc(domain.key)}" data-difficulty="${esc(
    guide.difficulty
  )}" data-search="${esc(
    `${local.title || guide.title} ${local.summary || guide.summary}`.toLowerCase()
  )}">
  <strong>${esc(local.title || guide.title)}</strong>
  <span class="sum">${esc(local.summary || guide.summary)}</span>
  <span class="meta">${diffChip(S, guide.difficulty)}<span class="chip">${esc(local.time || guide.time || '')}</span></span>
</a>`;
};

// ---------- build every language ----------

for (const lang of langs) {
  const S = lang.strings;

  // home: the whole tree on one page, searchable
  const domainsHtml = tree.domains
    .map(
      (domain, i) => `<section class="domain" id="${domain.key}">
  <h2><span class="dnum">${i + 1}</span> ${esc(domain.emoji)} <a href="/${lang.code}/${domain.key}/">${esc(
        (lang.code !== 'en' && domain.i18n?.[lang.code]?.title) || domain.title
      )}</a> <span class="count">${domain.guides.length} ${esc(S.guides)}</span></h2>
  <p class="intro">${esc((lang.code !== 'en' && domain.i18n?.[lang.code]?.intro) || domain.intro)}</p>
  <div class="grid">${domain.guides.map((g) => guideCard(lang, domain, g)).join('\n')}</div>
</section>`
    )
    .join('\n');

  write(
    join(DIST, lang.code, 'index.html'),
    page({
      lang,
      title: S.tagline,
      path: '',
      body: `<aside class="wildfire-home-door" aria-labelledby="wildfire-home-title">
  <div>
    <strong id="wildfire-home-title">Wildfire help · English</strong>
    <span>Leave safely, find official help, return and rebuild.</span>
  </div>
  <a href="/wildfire/">Open now <span aria-hidden="true">→</span></a>
</aside>
<section class="hero">
  <h1>${esc(S.tagline)}</h1>
  <p>${esc(S.hero)}</p>
  <label class="sr-only" for="q">${esc(S.searchPlaceholder)}</label>
  <input id="q" type="search" placeholder="${esc(S.searchPlaceholder)}" autocomplete="off">
  <p id="noresults" role="status" aria-live="polite" hidden>${esc(S.noResults)}</p>
</section>
${domainsHtml}
<script>
const q = document.getElementById('q');
q.addEventListener('input', () => {
  const t = q.value.trim().toLowerCase();
  let any = false;
  document.querySelectorAll('.card').forEach(c => {
    const hit = !t || c.dataset.search.includes(t);
    c.hidden = !hit; if (hit) any = true;
  });
  document.querySelectorAll('.domain').forEach(d => {
    d.hidden = !!t && ![...d.querySelectorAll('.card')].some(c => !c.hidden);
  });
  document.getElementById('noresults').hidden = any;
});
</script>`,
      learning: { kind: 'home' },
    })
  );

  for (const domain of tree.domains) {
    const dTitle = (lang.code !== 'en' && domain.i18n?.[lang.code]?.title) || domain.title;
    const dIntro = (lang.code !== 'en' && domain.i18n?.[lang.code]?.intro) || domain.intro;

    // domain page
    write(
      join(DIST, lang.code, domain.key, 'index.html'),
      page({
        lang,
        title: dTitle,
        path: `${domain.key}/`,
        body: `<p class="crumb"><a href="/${lang.code}/">${esc(S.home)}</a></p>
<h1>${esc(domain.emoji)} ${esc(dTitle)}</h1>
<p class="intro">${esc(dIntro)}</p>
<div class="grid">${domain.guides.map((g) => guideCard(lang, domain, g)).join('\n')}</div>`,
        learning: { kind: 'domain', domain: domain.key },
      })
    );

    // guide pages
    domain.guides.forEach((guide, gi) => {
      const own = content[lang.code][guide.slug];
      const fallback = content.en[guide.slug];
      const doc = own || fallback;
      if (!doc) return; // no content in any language yet — home/domain cards still show tree info

      const meta = doc.meta;
      const title = meta.title || guide.title;
      const localTitle = (slug) => {
        const c = content[lang.code][slug]?.meta || content.en[slug]?.meta;
        return c?.title || bySlug.get(slug)?.guide.title || slug;
      };
      const linkTo = (slug) => {
        const hit = bySlug.get(slug);
        return hit ? `<a href="/${lang.code}/${hit.domain.key}/${slug}/">${esc(localTitle(slug))}</a>` : '';
      };

      const needs = (guide.needs || []).map(linkTo).filter(Boolean);
      const opens = (unlocks.get(guide.slug) || []).map(linkTo).filter(Boolean);
      const prev = domain.guides[gi - 1];
      const next = domain.guides[gi + 1];
      const pn = (g, cls, label) =>
        g
          ? `<a class="${cls}" href="/${lang.code}/${domain.key}/${g.slug}/">${esc(label)}: ${esc(
              localTitle(g.slug)
            )}</a>`
          : '<span></span>';

      write(
        join(DIST, lang.code, domain.key, guide.slug, 'index.html'),
        page({
          lang,
          title,
          path: `${domain.key}/${guide.slug}/`,
          body: `<p class="crumb"><a href="/${lang.code}/">${esc(S.home)}</a> / <a href="/${lang.code}/${
            domain.key
          }/">${esc(domain.emoji)} ${esc(dTitle)}</a></p>
${own ? '' : `<p class="notice">${esc(S.notYetTranslated)}</p>`}
<article class="guide">
<h1>${esc(title)}</h1>
<p class="lede">${esc(meta.summary || guide.summary)}</p>
<p class="meta">${diffChip(S, guide.difficulty)}<span class="chip">⏳ ${esc(meta.time || guide.time || '')}</span><span class="chip evid-${evidenceOf(guide.slug)}">${esc(evidenceOf(guide.slug) === 'hand-tested' ? S.evidenceTested : S.evidenceAsserted)}</span></p>
${needs.length ? `<div class="box needs"><strong>${esc(S.youNeedFirst)}:</strong> ${needs.join(' · ')}</div>` : ''}
${marked.parse(doc.body)}
${opens.length ? `<div class="box opens"><strong>${esc(S.unlocks)}:</strong> ${opens.join(' · ')}</div>` : ''}
<details class="marginbox">
<summary>${esc(S.marginInvite)}</summary>
<p class="hint">${esc(S.marginHint)}</p>
<textarea id="mnote" maxlength="2000" rows="4"></textarea>
<div class="mrow"><input id="mfrom" maxlength="80" placeholder="${esc(S.marginName)}"><label><input type="checkbox" id="mhands"> ${esc(S.marginHands)}</label></div>
<p class="hint">${esc(S.marginChoices)} <a href="/margin">${esc(S.marginTerms)}</a></p>
<div class="marginchoices">
  <label><input type="checkbox" id="mpublish"> ${esc(S.marginPublish)}</label>
  <label><input type="checkbox" id="mretain"> ${esc(S.marginRetain)}</label>
  <label><input type="checkbox" id="mfold"> ${esc(S.marginFold)}</label>
</div>
<button id="msend">${esc(S.marginSend)}</button>
<p id="mmsg" class="hint" aria-live="polite"></p>
<textarea id="mreceipt" class="marginreceipt" rows="4" readonly hidden aria-label="${esc(S.marginReceipt)}"></textarea>
</details>
<script>
(function () {
  var MARGIN_OK = ${JSON.stringify(S.marginThanks)};
  var MARGIN_FAIL = ${JSON.stringify(S.marginFail)};
  var MARGIN_CHOICE = ${JSON.stringify(S.marginChoiceRequired)};
  var MARGIN_SAVE = ${JSON.stringify(S.marginSaveRemoval)};
  var send = document.getElementById('msend');
  send.addEventListener('click', function () {
    var note = document.getElementById('mnote').value.trim();
    var msg = document.getElementById('mmsg');
    var receipt = document.getElementById('mreceipt');
    if (!note) return;
    var publish = document.getElementById('mpublish').checked;
    var retain = document.getElementById('mretain').checked;
    if (!publish || !retain) {
      msg.textContent = MARGIN_CHOICE;
      return;
    }
    receipt.hidden = true;
    receipt.value = '';
    send.disabled = true;
    fetch('/margin/${guide.slug}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        note: note,
        from: document.getElementById('mfrom').value.trim(),
        hands: document.getElementById('mhands').checked,
        lang: '${lang.code}',
        terms_version: ${JSON.stringify(MARGIN_TERMS.schema_version)},
        choices: {
          publish: publish,
          retain: retain,
          fold: document.getElementById('mfold').checked
        }
      })
    }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) {
          msg.textContent = body && body.detail ? body.detail : MARGIN_FAIL;
          return;
        }
        msg.textContent = MARGIN_OK + ' ' + MARGIN_SAVE;
        receipt.value = 'curl --request DELETE ' +
          "--header 'Authorization: " + body.removal.authorization + "' '" +
          body.removal.href + "'";
        receipt.hidden = false;
        document.getElementById('mnote').value = '';
        document.getElementById('mpublish').checked = false;
        document.getElementById('mretain').checked = false;
        document.getElementById('mfold').checked = false;
      });
    }).catch(function () { msg.textContent = MARGIN_FAIL; })
      .finally(function () { send.disabled = false; });
  });
})();
</script>
</article>
<nav class="prevnext">${pn(prev, 'prev', S.prev)}${pn(next, 'next', S.next)}</nav>`,
          learning: {
            kind: 'guide',
            guide: guide.slug,
            domain: domain.key,
            difficulty: guide.difficulty,
          },
        })
      );
    });
  }
}

// ---------- the learning System ----------
// A private, self-attested lens over the existing prerequisite tree. Pages,
// safety information, and rights never depend on rank. The browser records
// only an explicit goal and explicit study marks; no visit earns anything.
for (const lang of langs) {
  const W = lang.strings.learningSystem;
  write(
    join(DIST, lang.code, 'system', 'index.html'),
    page({
      lang,
      title: W.pageTitle,
      path: 'system/',
      learning: { kind: 'system' },
      body: `<article class="system-page">
<p class="system-kicker">⚔ ${esc(W.kicker)}</p>
<h1>${esc(W.pageTitle)}</h1>
<p class="lede">${esc(W.intro)}</p>
<aside class="system-boundary">
  <strong>${esc(W.localOnly)}.</strong> ${esc(W.selfAttested)} ${esc(W.quietHelp)}
</aside>
<p class="system-xenia-boundary">${esc(W.xeniaBoundary)}</p>
<div id="learning-system-dashboard"></div>
<noscript><p class="notice">${esc(W.noScript)}</p></noscript>
</article>`,
    })
  );
}

// ---------- the front door ----------
// The root page tells you nothing. A word in the dark, and a spark floating
// where the dot of the middle "i" should be — the spark between mind and craft.
// The doors, for those who look:
//   · click the spark three times (it grows into a flame, then lets you in)
//   · type  fire / zero / begin / 火  anywhere on the page
//   · the old up-up-down-down code drops you at the very last page of the book
//   · after 40 quiet seconds, a whisper offers one hint
//   · the browser console tells you plainly (devtools people are real ones)
//   · screen readers get a proper labeled link; no-JS visitors get a small ·
// Once through, localStorage remembers and a quiet "enter" shows from then on.
// Direct links like /en/ always work — it's a riddle, not a gate.

const codes = langs.map((l) => l.code);
write(
  join(DIST, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mindicraft</title>
<meta name="description" content="🔥">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>">
<style>
  html,body{height:100%;margin:0}
  body{min-height:100%;height:auto;padding:1rem;box-sizing:border-box;background:#0d0b09;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;
    font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Songti SC",serif;overflow:auto}
  .word{font-size:clamp(2.4rem,9vw,4.2rem);line-height:1;letter-spacing:.05em;color:#57504a;user-select:none}
  .pivot{position:relative;display:inline-block}
  .spark{position:absolute;left:50%;bottom:.74em;width:.1em;height:.1em;border-radius:50%;border:0;padding:0;
    font-size:inherit;line-height:0;background:#e07a4a;box-shadow:0 0 .3em .04em rgba(224,122,74,.5);cursor:pointer;
    animation:breathe 4.5s ease-in-out infinite;transform:translateX(-50%);transition:all .6s ease}
  .spark::after{content:"";position:absolute;inset:-.3em;border-radius:50%}
  .spark:focus-visible{outline:1px dotted #8a6a50;outline-offset:.3em}
  .spark.s1{width:.16em;height:.16em;background:#eb8f55;box-shadow:0 0 .5em .1em rgba(235,143,85,.65)}
  .spark.s2{width:.22em;height:.22em;background:#ffb45e;box-shadow:0 0 .9em .22em rgba(255,180,94,.75);animation-duration:1.6s}
  @keyframes breathe{0%,100%{opacity:.5}50%{opacity:1}}
  .whisper{font-style:italic;font-size:.95rem;color:#4a4139;opacity:0;transition:opacity 3s;min-height:1.3em;text-align:center;padding:0 1rem}
  .whisper.on{opacity:.85}
  .enter{font-size:.85rem;letter-spacing:.2em;color:#6d5843;text-decoration:none;border-bottom:1px solid #3a2f24;
    opacity:0;transition:opacity 2s;pointer-events:none}
  .enter.on{opacity:.7;pointer-events:auto}
  .enter:hover{color:#e07a4a;border-color:#e07a4a}
  .wildfire-entry{display:flex;align-items:center;justify-content:space-between;gap:1.25rem;width:min(34rem,calc(100vw - 2rem));
    padding:.85rem 1rem;border:1px solid #655142;border-left:4px solid #d39a54;border-radius:.65rem;
    background:#17120e;color:#eadfd0;text-decoration:none;box-shadow:0 .5rem 2rem rgba(0,0,0,.18)}
  .wildfire-entry strong{display:block;font-size:.96rem;letter-spacing:.02em}
  .wildfire-entry span{display:block;margin-top:.12rem;color:#b9a99a;font:500 .75rem/1.4 -apple-system,"Segoe UI",sans-serif}
  .wildfire-entry::after{content:"→";color:#e6b36f;font:700 1.4rem/1 sans-serif}
  .wildfire-entry:hover,.wildfire-entry:focus-visible{border-color:#e6b36f;color:#fff}
  .flash{position:fixed;inset:0;background:radial-gradient(circle at 50% 45%,#ffb45e 0%,#e07a4a 38%,#0d0b09 78%);
    opacity:0;pointer-events:none;transition:opacity .85s ease}
  .flash.on{opacity:1}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .dot{color:#3a332c;text-decoration:none;font-size:1rem}
  @media (prefers-reduced-motion:reduce){
    .spark,.spark.s2{animation:none;transition:none}.whisper,.enter,.flash{transition:none}
  }
</style>
</head>
<body>
<a class="sr" href="/en/">mindicraft — the zero-to-one guide of human civilisation</a>
<a class="wildfire-entry" href="/wildfire/">
  <span><strong>Wildfire help</strong><span>Leave safely · find official help · return and rebuild</span></span>
</a>
<div class="word">mind<span class="pivot">&#305;<button class="spark" id="spark" aria-label="a spark"></button></span>craft</div>
<p class="whisper" id="whisper"></p>
<a class="enter" id="enter" href="/en/"></a>
<noscript><a class="dot" href="/en/">·</a></noscript>
<div class="flash" id="flash"></div>
<script>
const have=${JSON.stringify(codes)};
const tags=(navigator.languages||[navigator.language||'en']).map(t=>String(t).toLowerCase());
let lang='en';
for(const t of tags){
  if(t.startsWith('yue')||t.startsWith('zh-hk')||t.startsWith('zh-mo')){lang='yue';break}
  const two=t.slice(0,2);
  if(have.includes(two)){lang=two;break}
}
if(!have.includes(lang))lang='en';
const whispers={en:'everything begins with a spark',zh:'一切从一粒火星开始',yue:'所有嘢，都由一粒火花開始',es:'todo empieza con una chispa'};
const enters={en:'enter',zh:'进',yue:'入嚟',es:'entra'};
const spark=document.getElementById('spark'),flash=document.getElementById('flash');
let stage=0;
function open(to){try{localStorage.setItem('mindicraft','lit')}catch(e){}
  flash.classList.add('on');setTimeout(()=>location.href=to||('/'+lang+'/'),800)}
spark.addEventListener('click',()=>{stage++;
  if(stage===1)spark.classList.add('s1');else if(stage===2)spark.classList.add('s2');else open()});
let buf='';
addEventListener('keydown',e=>{if(e.key&&e.key.length===1){buf=(buf+e.key.toLowerCase()).slice(-12);
  if(buf.endsWith('wildfire'))open('/wildfire/');
  else if(/(fire|zero|begin)$/.test(buf)||buf.endsWith('火'))open()}});
const K=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];let ki=0;
addEventListener('keydown',e=>{ki=(e.key===K[ki])?ki+1:(e.key===K[0]?1:0);
  if(ki===K.length)open('/'+lang+'/living-together/plant-a-village/')});
document.getElementById('whisper').textContent=whispers[lang]||whispers.en;
setTimeout(()=>document.getElementById('whisper').classList.add('on'),40000);
try{if(localStorage.getItem('mindicraft')==='lit'){const a=document.getElementById('enter');
  a.textContent=enters[lang]||enters.en;a.href='/'+lang+'/';a.classList.add('on')}}catch(e){}
console.log('%c\\ud83d\\udd25 shelter, water, fire, food.','color:#e07a4a;font-size:14px');
console.log('the door: click the spark three times. or just walk in: /'+lang+'/');
console.log('past the edge of the map: /frontier/');
</script>
</body>
</html>`
);

write(
  join(DIST, '404.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>·</title>
<style>html,body{height:100%;margin:0}body{background:#0d0b09;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.4rem;font-family:"Iowan Old Style",Palatino,Georgia,serif}
p{color:#57504a;font-style:italic}a{color:#e07a4a;text-decoration:none;font-size:1.4rem}</style></head>
<body><p>not every path is a door.</p><a href="/" aria-label="back to the spark">·</a>
<p style="margin-top:2.5rem;font-size:.8rem;opacity:.6"><a href="/wildfire/" style="color:#b18455">wildfire help</a>   <a href="/en/" style="color:#57504a">the book</a>   <a href="/remedies/" style="color:#57504a">remedies</a>   <a href="/frontier/" style="color:#57504a">frontier</a>   <a href="/agent.txt" style="color:#57504a">agent.txt</a></p></body></html>`
);

cpSync(join(ROOT, 'style.css'), join(DIST, 'style.css'));
cpSync(join(ROOT, 'learning-system.mjs'), join(DIST, 'learning-system.mjs'));
cpSync(join(ROOT, 'learning-ui.mjs'), join(DIST, 'learning-ui.mjs'));

// ---------- the API: the same book, machine-readable ----------
// Everything an agent needs, as static JSON on the same deploy. No servers,
// no keys, no gate. CORS is opened for /api/* in dist/_headers below.

const BUILT = BUILD_DATE;
const PROVENANCE = {
  source: 'mindicraft.com',
  built: BUILT,
  certainty: 'field-tested tradition, adversarially fact-checked',
  license: 'made to be copied — take it, translate it, pass it on',
};

const writeJson = (path, obj) => write(path, JSON.stringify(obj, null, 1));

// ---------- Wildfire help ----------
// Emergency guidance is a reviewed shelf outside the learning tree. It has no
// progress, form, location request, live incident claim, or browser script.
// The same edition is carried as HTML, JSON, and plain text.

const WILDFIRE_SOURCE_BY_ID = new Map(
  WILDFIRE.source.sources.map((source) => [source.id, source])
);
const WILDFIRE_SOURCE_NUMBER_BY_ID = new Map(
  WILDFIRE.source.sources.map((source, index) => [source.id, index + 1])
);
const wildfireSourceRefs = (sourceIds) =>
  `<span class="wildfire-citations" aria-label="Sources">Sources: ${sourceIds
    .map((sourceId) => {
      const source = WILDFIRE_SOURCE_BY_ID.get(sourceId);
      const number = WILDFIRE_SOURCE_NUMBER_BY_ID.get(sourceId);
      return `<a href="${esc(source.url)}" aria-label="Source ${number}: ${esc(
        source.title
      )}">[${number}]</a>`;
    })
    .join(' ')}</span>`;

const wildfirePathHtml = (path) => `<section class="wildfire-path${
  path.urgent ? ' wildfire-path-urgent' : ''
}" id="${esc(path.id)}">
  <div class="wildfire-path-heading">
    <p>${path.urgent ? 'Leave first' : 'One next step'}</p>
    <h2>${esc(path.title)}</h2>
    <span>${esc(path.summary)}</span>
  </div>
  <ol>${path.steps
    .map(
      (step) => `<li id="${esc(path.id)}-${esc(step.id)}">
    <span>${esc(step.text)}</span>
    ${wildfireSourceRefs(step.source_ids)}
  </li>`
    )
    .join('')}</ol>
  <div class="wildfire-say">
    <strong>Words you can use</strong>
    <p>${esc(path.say)}</p>
  </div>
</section>`;

const wildfireRegionHtml = (region) => `<details class="wildfire-region" id="region-${esc(
  region.id
)}">
  <summary>${esc(region.title)}</summary>
  <div>
    <p>${esc(region.scope)}</p>
    ${
      region.emergency
        ? `<p class="wildfire-call"><strong>Immediate danger in ${esc(
            region.title
          )}:</strong> <a href="${esc(region.emergency.call)}">Call ${esc(
            region.emergency.display
          )}</a> ${wildfireSourceRefs([region.emergency.source_id])}</p>`
        : ''
    }
    <ul>${region.links
      .map((link) => {
        const source = WILDFIRE_SOURCE_BY_ID.get(link.source_id);
        return `<li><a href="${esc(source.url)}"><strong>${esc(
          link.label
        )}</strong></a><span>${esc(link.purpose)}</span><small>Official or recognized humanitarian site · checked ${esc(
          source.observed_at
        )}</small></li>`;
      })
      .join('')}</ul>
  </div>
</details>`;

const WILDFIRE_PAYLOAD = Object.freeze({
  schema_version: 'mindicraft.wildfire-api/1',
  edition: WILDFIRE.source,
  counts: WILDFIRE.counts,
  links: Object.freeze({
    human: '/wildfire/',
    leave_now_text: '/wildfire/leave-now.txt',
    full_offline_text: '/wildfire/quick.txt',
    correction: WILDFIRE.source.correction,
  }),
  provenance: Object.freeze({
    source: 'guide/wildfire.json',
    source_digest: WILDFIRE.sourceDigest,
    reviewed_at: WILDFIRE.source.reviewed_at,
    next_review_due: WILDFIRE.source.next_review_due,
    build_network_requests: 0,
  }),
});

const WILDFIRE_API_DIR = join(DIST, 'api', 'wildfire');
const WILDFIRE_PAGE_DIR = join(DIST, 'wildfire');
// These exact roots are wholly generated here. Clearing them prevents a stale
// emergency edition from remaining live after a renamed or withdrawn file.
rmSync(WILDFIRE_API_DIR, { recursive: true, force: true });
rmSync(WILDFIRE_PAGE_DIR, { recursive: true, force: true });
writeJson(join(WILDFIRE_API_DIR, 'index.json'), WILDFIRE_PAYLOAD);

const wildfireLeaveNowText = `WILDFIRE — LEAVE NOW

${WILDFIRE.source.boundary.authority}
${WILDFIRE.source.boundary.live_status}

${WILDFIRE.source.paths[0].steps
  .map((step, index) => `${index + 1}. ${step.text}`)
  .join('\n')}

Words you can use:
${WILDFIRE.source.paths[0].say}

OFFICIAL CURRENT INFORMATION
Choose the country or region yourself. Open the relevant official site for
current orders and routes. Mindicraft does not know live conditions.

${WILDFIRE.source.regions
  .filter((region) => region.id !== 'global')
  .map((region) => {
    const firstLink =
      region.id === 'canada'
        ? region.links.find((link) => link.source_id === 'canada-provinces')
        : region.links[0];
    const source = WILDFIRE_SOURCE_BY_ID.get(firstLink.source_id);
    return `${region.title}${
      region.emergency ? ` — emergency: ${region.emergency.display}` : ''
    }\n${firstLink.label}: ${source.url}`;
  })
  .join('\n\n')}

Elsewhere or not sure:
Find your recognized Red Cross or Red Crescent society:
${WILDFIRE_SOURCE_BY_ID.get('ifrc-directory').url}

Reviewed ${WILDFIRE.source.reviewed_at}; review again by ${
  WILDFIRE.source.next_review_due
}.
Full guide: https://mindicraft.com/wildfire/
`;
write(join(WILDFIRE_PAGE_DIR, 'leave-now.txt'), wildfireLeaveNowText);

const wildfireQuickText = `${WILDFIRE.source.title.toUpperCase()}

Reviewed: ${WILDFIRE.source.reviewed_at}
Review again by: ${WILDFIRE.source.next_review_due}
Source edition: ${WILDFIRE.sourceDigest}

${WILDFIRE.source.care.title}
${WILDFIRE.source.care.message}
${WILDFIRE.source.care.next_step}

IMPORTANT BOUNDARY
${WILDFIRE.source.boundary.live_status}
${WILDFIRE.source.boundary.authority}
${WILDFIRE.source.boundary.emergency}
${WILDFIRE.source.boundary.privacy}

When wildfire or an evacuation order threatens you, this page replaces the
general lost-person stay-put and signal-fire advice in the civilisation guide.

${WILDFIRE.source.paths
  .map(
    (path, pathIndex) => `${pathIndex + 1}. ${path.title.toUpperCase()}
${path.summary}
${path.steps
  .map(
    (step, stepIndex) =>
      `  ${stepIndex + 1}) ${step.text}\n     Sources: ${step.source_ids
        .map((sourceId) => WILDFIRE_SOURCE_BY_ID.get(sourceId).url)
        .join(' | ')}`
  )
  .join('\n')}
Words you can use: ${path.say}`
  )
  .join('\n\n')}

ASK FOR ONE PRACTICAL NEED
${WILDFIRE.source.support_needs
  .map((need) => `- ${need.title}: ${need.ask}`)
  .join('\n')}

OFFICIAL HELP BY REGION
Open these sites again for current orders, roads, shelter availability, return
clearance, deadlines, and eligibility. This saved copy does not know them.

${WILDFIRE.source.regions
  .map(
    (region) => `${region.title}
${region.scope}
${region.emergency ? `Emergency: ${region.emergency.display}\n` : ''}${region.links
      .map((link) => {
        const source = WILDFIRE_SOURCE_BY_ID.get(link.source_id);
        return `- ${link.label}: ${link.purpose}\n  ${source.url}`;
      })
      .join('\n')}`
  )
  .join('\n\n')}

SOURCES
${WILDFIRE.source.sources
  .map(
    (source, index) =>
      `[${index + 1}] ${source.title} — ${source.publisher}\n${source.url}\nChecked ${source.observed_at}`
  )
  .join('\n\n')}

Correction: ${WILDFIRE.source.correction}
Human page: https://mindicraft.com/wildfire/
JSON: https://mindicraft.com/api/wildfire/index.json
`;
write(join(WILDFIRE_PAGE_DIR, 'quick.txt'), wildfireQuickText);

write(
  join(WILDFIRE_PAGE_DIR, 'index.html'),
  page({
    lang: langs.find((language) => language.code === 'en'),
    title: 'Wildfire help — leave safely, find support, rebuild',
    path: '',
    description:
      'A reviewed, printable wildfire evacuation and recovery guide with official regional help, smoke safety, return checks, and practical rebuilding steps.',
    showLanguageSwitch: false,
    head: `<link rel="canonical" href="https://mindicraft.com/wildfire/">
<meta property="og:title" content="Wildfire help — leave safely, find support, rebuild">
<meta property="og:description" content="Choose the next safe step. Reviewed guidance and official doors for evacuation, shelter, smoke, return, and rebuilding.">
<meta property="og:url" content="https://mindicraft.com/wildfire/">
<meta property="og:type" content="article">`,
    body: `<article class="wildfire-page">
<section class="wildfire-now" aria-labelledby="wildfire-now-title">
  <p>Immediate danger or evacuation order</p>
  <h1 id="wildfire-now-title">Leave now. Do not finish this page.</h1>
  <p>${esc(WILDFIRE.source.paths[0].steps[0].text)}</p>
  <div class="wildfire-now-actions">
    <a class="wildfire-primary-action" href="#leave-now">Open the leave-now steps</a>
    <a href="#official-help">Find official local help</a>
  </div>
</section>

<header class="wildfire-hero">
  <p class="wildfire-kicker">Reviewed emergency guide · English</p>
  <h2>${esc(WILDFIRE.source.title)}</h2>
  <p class="wildfire-care"><strong>${esc(WILDFIRE.source.care.title)}</strong><br>${esc(
    WILDFIRE.source.care.message
  )}</p>
  <p>${esc(WILDFIRE.source.care.next_step)}</p>
</header>

<aside class="wildfire-boundary" aria-labelledby="wildfire-boundary-title">
  <h2 id="wildfire-boundary-title">What this page knows—and does not know</h2>
  <p><strong>${esc(WILDFIRE.source.boundary.live_status)}</strong></p>
  <p>${esc(WILDFIRE.source.boundary.authority)}</p>
  <p>${esc(WILDFIRE.source.boundary.emergency)}</p>
  <p>${esc(WILDFIRE.source.boundary.privacy)}</p>
  <p><strong>Wildfire exception:</strong> When wildfire or an evacuation order threatens you,
  this page replaces the general lost-person stay-put and signal-fire advice in the civilisation guide.</p>
</aside>

<nav class="wildfire-choices" aria-label="Choose what is true now">
  <h2>What is true now?</h2>
  <div>${WILDFIRE.source.paths
    .map(
      (path) => `<a${path.urgent ? ' class="urgent"' : ''} href="#${esc(path.id)}">
    <strong>${esc(path.title)}</strong><span>${esc(path.summary)}</span>
  </a>`
    )
    .join('')}</div>
</nav>

${WILDFIRE.source.paths.map(wildfirePathHtml).join('\n')}

<section class="wildfire-needs" id="practical-help">
  <h2>Ask for one practical need</h2>
  <p>You can read or copy these words. A local authority or service may ask for more detail.</p>
  <div>${WILDFIRE.source.support_needs
    .map(
      (need) => `<section><h3>${esc(need.title)}</h3><p>${esc(
        need.ask
      )}</p>${wildfireSourceRefs(need.source_ids)}</section>`
    )
    .join('')}</div>
</section>

<section class="wildfire-official" id="official-help">
  <h2>Official help where you are</h2>
  <p><strong>Choose your country or region yourself.</strong> Mindicraft does not detect or store it.
  These links leave Mindicraft only when you open them. Reopen the official site for current orders,
  roads, shelter availability, return clearance, aid deadlines, and eligibility.</p>
  ${WILDFIRE.source.regions.map(wildfireRegionHtml).join('\n')}
</section>

<section class="wildfire-sources" id="sources">
  <h2>Sources and review</h2>
  <p>This edition was checked on <strong>${esc(
    WILDFIRE.source.reviewed_at
  )}</strong>. It must be reviewed again by <strong>${esc(
    WILDFIRE.source.next_review_due
  )}</strong>. Every numbered link below goes to the named official or recognized humanitarian source.</p>
  <ol>${WILDFIRE.source.sources
    .map(
      (source) => `<li id="source-${esc(source.id)}"><a href="${esc(
        source.url
      )}"><strong>${esc(source.title)}</strong></a><span>${esc(
        source.publisher
      )} · ${esc(source.region)} · checked ${esc(source.observed_at)}</span></li>`
    )
    .join('')}</ol>
</section>

<aside class="wildfire-carry">
  <h2>Carry or share this guide</h2>
  <p><a href="/wildfire/leave-now.txt">Small leave-now text card</a> ·
  <a href="/wildfire/quick.txt">Full plain text for saving or printing</a> ·
  <a href="/api/wildfire/index.json">Reviewed JSON for tools and agents</a> ·
  <a href="${esc(WILDFIRE.source.correction)}">Report a correction</a></p>
  <p>${esc(WILDFIRE.source.rights.reuse)}</p>
  <p><code>${esc(WILDFIRE.sourceDigest)}</code></p>
</aside>
</article>`,
  })
);

// ---------- the Castle shelf: a map, not a copy of the Castle ----------
// The root bridge owns these metadata cards. It reads only Castle Gate's
// curated public snapshot and pins every card to the snapshot receipt.

const CASTLE_SAFE_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]*$/u;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ordered = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function castleEntriesDigest(files) {
  const hash = createHash('sha256');
  for (const [filename, text] of [...files].sort(([a], [b]) => ordered(a, b))) {
    hash.update(filename);
    hash.update('\0');
    hash.update(digest(Buffer.from(text)));
    hash.update('\n');
  }
  return `sha256:${hash.digest('hex')}`;
}

function loadCastleShelf() {
  const receiptPath = join(MINDICRAFT_INDEX, '_castle-sync.json');
  if (!existsSync(receiptPath)) {
    throw new Error('Castle shelf receipt is missing; run node castle-to-mindicraft.mjs --write');
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (
    receipt.schema_version !== 'mindicraft.castle-sync/1' ||
    receipt.collection !== 'castle-of-understanding'
  ) {
    throw new Error('Castle shelf receipt has an unsupported shape');
  }
  if (
    !/^[0-9a-f]{40}$/.test(receipt.source?.manifest_revision || '') ||
    !/^sha256:[0-9a-f]{64}$/.test(receipt.source?.manifest_digest || '') ||
    !/^sha256:[0-9a-f]{64}$/.test(receipt.source?.payload_digest || '')
  ) {
    throw new Error('Castle shelf receipt has an incomplete provenance pin');
  }
  if (
    receipt.privacy?.scope !== 'public_curated' ||
    receipt.privacy?.raw_source_included !== false ||
    receipt.privacy?.curation_profile !== 'castle-gate-public/v1' ||
    receipt.privacy?.coverage !== 'not_exhaustive' ||
    receipt.privacy?.secure_recall !== 'not_guaranteed'
  ) {
    throw new Error('Castle shelf is outside the curated public boundary');
  }
  if (
    receipt.authority?.automatic_action !== 'never' ||
    !Array.isArray(receipt.authority?.grants) ||
    receipt.authority.grants.length !== 0
  ) {
    throw new Error('Castle shelf carries authority Mindicraft will not accept');
  }
  if (
    receipt.return?.automatic_ingest_into_castle !== false ||
    !/^https?:\/\//.test(receipt.return?.public_correction || '')
  ) {
    throw new Error('Castle shelf does not preserve the one-way return boundary');
  }
  if (!receipt.rights?.spdx || !receipt.rights?.grant) {
    throw new Error('Castle shelf has no rights statement');
  }

  const filenames = readdirSync(MINDICRAFT_INDEX)
    .filter((file) => /^castle-(?:room|word)-.+\.json$/u.test(file))
    .sort(ordered);
  const files = [];
  const entries = [];
  const seen = new Set();
  const forbidden = /^(?:body|bodyHtml|body_markdown|content|html|markdown)$/i;

  for (const filename of filenames) {
    const text = readFileSync(join(MINDICRAFT_INDEX, filename), 'utf8');
    const entry = JSON.parse(text);
    const match = filename.match(/^castle-(room|word)-(.+)\.json$/u);
    const [, kind, slug] = match;
    const expectedCategory = kind === 'room' ? 'jeongqing' : 'glossame';

    if (!CASTLE_SAFE_SLUG.test(slug) || slug.includes('..')) {
      throw new Error(`Castle shelf has an unsafe slug: ${filename}`);
    }
    if (
      entry.id !== filename.slice(0, -5) ||
      entry.slug !== slug ||
      entry.kind !== kind ||
      entry.from !== 'castle-of-understanding' ||
      entry.collection !== 'castle-of-understanding' ||
      entry.category !== expectedCategory
    ) {
      throw new Error(`Castle shelf identity differs from its filename: ${filename}`);
    }
    if (seen.has(entry.id)) throw new Error(`Castle shelf repeats id ${entry.id}`);
    seen.add(entry.id);
    if (Object.keys(entry).some((key) => forbidden.test(key))) {
      throw new Error(`Castle shelf entry carries body content: ${filename}`);
    }
    if (
      entry.rights?.spdx !== receipt.rights.spdx ||
      entry.rights?.grant !== receipt.rights.grant ||
      entry.authority?.automatic_action !== receipt.authority.automatic_action ||
      JSON.stringify(entry.authority?.grants) !== JSON.stringify(receipt.authority.grants)
    ) {
      throw new Error(`Castle shelf rights or authority drifted: ${filename}`);
    }
    if (
      entry.castle?.protocol !== receipt.source.protocol ||
      entry.castle?.source_revision !== receipt.source.revision ||
      entry.castle?.gate_revision !== receipt.source.gate_revision ||
      entry.castle?.snapshot !== receipt.source.payload ||
      entry.castle?.snapshot_digest !== receipt.source.payload_digest ||
      entry.castle?.manifest_path !== receipt.source.manifest_path ||
      entry.castle?.manifest_revision !== receipt.source.manifest_revision ||
      entry.castle?.manifest_digest !== receipt.source.manifest_digest ||
      entry.castle?.correction !== receipt.return.public_correction ||
      entry.castle?.automatic_return_ingest !== false
    ) {
      throw new Error(`Castle shelf provenance drifted: ${filename}`);
    }
    for (const url of [entry.url, entry.castle.snapshot, entry.castle.correction]) {
      if (!/^https?:\/\//.test(url || '')) {
        throw new Error(`Castle shelf has a non-HTTP source link: ${filename}`);
      }
    }

    files.push([filename, text]);
    entries.push(entry);
  }

  const rooms = entries.filter((entry) => entry.kind === 'room').length;
  const words = entries.filter((entry) => entry.kind === 'word').length;
  if (
    entries.length !== receipt.counts?.entries ||
    rooms !== receipt.counts?.rooms ||
    words !== receipt.counts?.words
  ) {
    throw new Error('Castle shelf entry counts differ from its receipt');
  }
  if (castleEntriesDigest(files) !== receipt.entries_digest) {
    throw new Error('Castle shelf entry digest differs from its receipt');
  }

  const fullEntries = entries.sort((a, b) => ordered(a.id, b.id)).map((entry) => ({
    ...entry,
    api: `/api/castle/${entry.kind === 'room' ? 'rooms' : 'words'}/${encodeURIComponent(entry.slug)}.json`,
  }));
  const compactEntries = fullEntries.map(({ id, kind, slug, title, summary, url, api }) => ({
    id,
    kind,
    slug,
    title,
    summary,
    url,
    api,
  }));

  return { receipt, fullEntries, compactEntries };
}

const CASTLE_SHELF = loadCastleShelf();
const CASTLE_API_DIR = join(DIST, 'api', 'castle');
rmSync(CASTLE_API_DIR, { recursive: true, force: true });
for (const entry of CASTLE_SHELF.fullEntries) {
  writeJson(
    join(CASTLE_API_DIR, entry.kind === 'room' ? 'rooms' : 'words', `${entry.slug}.json`),
    entry
  );
}
writeJson(join(CASTLE_API_DIR, 'index.json'), {
  schema_version: 'mindicraft.castle-index/1',
  this_is:
    'a small public map of the Castle of Understanding; the linked Castle remains the authority',
  collection: 'castle-of-understanding',
  count: CASTLE_SHELF.compactEntries.length,
  counts: CASTLE_SHELF.receipt.counts,
  entries: CASTLE_SHELF.compactEntries,
  source: CASTLE_SHELF.receipt.source,
  privacy: CASTLE_SHELF.receipt.privacy,
  rights: CASTLE_SHELF.receipt.rights,
  authority: CASTLE_SHELF.receipt.authority,
  return: CASTLE_SHELF.receipt.return,
  entries_digest: CASTLE_SHELF.receipt.entries_digest,
  entries_digest_scope:
    'the full generated source metadata cards; compact discovery entries above intentionally omit fields',
});

// ---------- Medicines and their natural lineages ----------
// A committed, reviewed shelf with claim-level sources. It is deliberately
// separate from both the craft evidence labels and the open collector.

const REMEDY_SOURCE_BY_ID = new Map(
  REMEDIES.sources.map((source) => [source.id, source])
);
const remedySourceIds = (value) => {
  const found = new Set();
  (function walk(child) {
    if (Array.isArray(child)) return child.forEach(walk);
    if (!child || typeof child !== 'object') return;
    if (Array.isArray(child.source_ids)) {
      child.source_ids.forEach((sourceId) => found.add(sourceId));
    }
    Object.values(child).forEach(walk);
  })(value);
  return [...found];
};
const remedySourcesFor = (value) =>
  remedySourceIds(value).map((sourceId) => REMEDY_SOURCE_BY_ID.get(sourceId));
const remedyNaturalSummary = (link) => ({
  id: link.id,
  name: link.name,
  names: link.names,
  scientific_name: link.scientific_name,
  traditions: link.traditions,
  relationship: link.relationship,
  evidence_level: link.clinical_evidence.level,
  replacement_status: link.replacement.status,
});
const REMEDY_PROVENANCE = {
  source: 'guide/remedies.json',
  source_digest: REMEDIES.sourceDigest,
  reviewed_at: REMEDIES.source.reviewed_at,
  next_review_due: REMEDIES.source.next_review_due,
  build_network_requests: 0,
};
const REMEDY_INDEX_ENTRIES = REMEDIES.cards.map((card) => ({
  id: card.id,
  title: card.title,
  summary: card.summary,
  clinical_area: card.clinical_area,
  medicine: {
    name: card.medicine.name,
    aliases: card.medicine.aliases,
    origin_classes: card.medicine.origin_classes,
  },
  nature_links: card.nature_links.map(remedyNaturalSummary),
  source_ids: remedySourceIds(card),
  reviewed_at: card.reviewed_at,
  page: `/remedies/${card.id}/`,
  api: `/api/remedies/${card.id}.json`,
}));
const REMEDY_INDEX_PAYLOAD = {
  schema_version: 'mindicraft.remedies-index/1',
  this_is: REMEDIES.source.title,
  description: REMEDIES.source.description,
  content_is: REMEDIES.source.content_is,
  count: REMEDY_INDEX_ENTRIES.length,
  entries: REMEDY_INDEX_ENTRIES,
  companion: {
    id: 'healing-arts',
    title: HEALING_ARTS.source.title,
    description: HEALING_ARTS.source.description,
    count: HEALING_ARTS.counts.traditions,
    page: '/remedies/healing-arts/',
    api: '/api/remedies/healing-arts/index.json',
  },
  principles: REMEDIES.source.principles,
  sources: remedySourcesFor({
    principles: REMEDIES.source.principles,
    cards: REMEDIES.cards,
  }),
  evidence_levels: REMEDIES.source.evidence_levels,
  relationship_types: REMEDIES.source.relationship_types,
  boundary: REMEDIES.source.boundary,
  rights: REMEDIES.source.rights,
  correction: REMEDIES.source.correction,
  provenance: REMEDY_PROVENANCE,
};
const REMEDY_API_DIR = join(DIST, 'api', 'remedies');
const REMEDY_PAGE_DIR = join(DIST, 'remedies');
// These directories are wholly generated by this builder. Clearing only these
// exact roots prevents renamed or withdrawn medical cards from remaining live.
rmSync(REMEDY_API_DIR, { recursive: true, force: true });
rmSync(REMEDY_PAGE_DIR, { recursive: true, force: true });
writeJson(join(REMEDY_API_DIR, 'index.json'), REMEDY_INDEX_PAYLOAD);
for (const card of REMEDIES.cards) {
  writeJson(join(REMEDY_API_DIR, `${card.id}.json`), {
    schema_version: 'mindicraft.remedy/1',
    content_is: REMEDIES.source.content_is,
    card,
    sources: remedySourcesFor(card),
    evidence_levels: REMEDIES.source.evidence_levels,
    relationship_types: REMEDIES.source.relationship_types,
    boundary: REMEDIES.source.boundary,
    rights: REMEDIES.source.rights,
    correction: REMEDIES.source.correction,
    provenance: REMEDY_PROVENANCE,
  });
}

// ---------- Healing arts across cultures ----------
// Historical context belongs beside the medicine lineages, but it is not a
// treatment shelf. The source is deliberately non-operational and keeps
// alchemy, pharmacy, ritual care, and living knowledge distinct.

const HEALING_ARTS_PROVENANCE = {
  source: 'guide/healing-arts.json',
  source_digest: HEALING_ARTS.sourceDigest,
  reviewed_at: HEALING_ARTS.source.reviewed_at,
  build_network_requests: 0,
};
const HEALING_ARTS_PAYLOAD = {
  schema_version: 'mindicraft.healing-arts/1',
  this_is: HEALING_ARTS.source.title,
  description: HEALING_ARTS.source.description,
  content_is: HEALING_ARTS.source.content_is,
  selection_basis: HEALING_ARTS.source.selection_basis,
  count: HEALING_ARTS.counts.traditions,
  traditions: HEALING_ARTS.source.traditions,
  sources: HEALING_ARTS.source.sources,
  boundary: HEALING_ARTS.source.boundary,
  authority: HEALING_ARTS.source.authority,
  rights: HEALING_ARTS.source.rights,
  correction: HEALING_ARTS.source.correction,
  provenance: HEALING_ARTS_PROVENANCE,
};
writeJson(
  join(DIST, 'api', 'remedies', 'healing-arts', 'index.json'),
  HEALING_ARTS_PAYLOAD
);

// ---------- the Frontier Walk: honest unknowns, never hidden instructions ----------
// The reviewed source is local and committed. The build performs no network
// request, chooses one edition trail by digest, and generates no write door.

const NEEDS_EDGE_COUNT = tree.domains.reduce(
  (total, domain) =>
    total + domain.guides.reduce((count, guide) => count + (guide.needs || []).length, 0),
  0
);
const MISSING_TRANSLATION_COUNT = Object.values(missing).reduce(
  (total, paths) => total + paths.length,
  0
);
const EVIDENCE_RECORD_COUNT = Object.keys(evidence).length;
const HAND_TESTED_COUNT = Object.values(evidence).filter(
  (record) => record?.state === 'hand-tested'
).length;
const FRONTIER_FACTS = [
  {
    id: 'guide-count',
    value: TOTAL,
    unit: 'guides',
    scope: 'this_build',
    evidence_state: 'computed',
    basis: 'the unique guide slugs in guide/tree.json',
  },
  {
    id: 'needs-edge-count',
    value: NEEDS_EDGE_COUNT,
    unit: 'needs edges',
    scope: 'this_build',
    evidence_state: 'computed',
    basis: 'every needs item in guide/tree.json',
  },
  {
    id: 'language-count',
    value: langs.length,
    unit: 'languages',
    scope: 'this_build',
    evidence_state: 'computed',
    basis: 'guide/langs.json',
  },
  {
    id: 'missing-translation-count',
    value: MISSING_TRANSLATION_COUNT,
    unit: 'missing guide translations',
    scope: 'this_build',
    evidence_state: 'computed',
    basis: 'expected tree paths absent from guide/content',
  },
  {
    id: 'evidence-record-count',
    value: EVIDENCE_RECORD_COUNT,
    unit: 'guide evidence records',
    scope: 'this_build',
    evidence_state: 'computed',
    basis: 'guide/evidence.json',
  },
  {
    id: 'hand-tested-count',
    value: HAND_TESTED_COUNT,
    unit: 'hand-tested guides',
    scope: 'this_build',
    evidence_state: 'computed',
    basis: 'records whose state is hand-tested in guide/evidence.json',
  },
];

const frontierGuide = (slug) => {
  const hit = bySlug.get(slug);
  return {
    slug,
    domain: hit.domain.key,
    title: hit.guide.title,
    page: `/en/${hit.domain.key}/${slug}/`,
    api: `/api/guides/{lang}/${hit.domain.key}/${slug}.json`,
  };
};
const FRONTIER_CARDS = FRONTIERS.cards.map((card) => ({
  ...card,
  related_guides: card.related_guides.map(frontierGuide),
}));
const FRONTIER_CARD_BY_ID = new Map(
  FRONTIER_CARDS.map((card) => [card.id, card])
);
const FRONTIER_TRAILS = FRONTIERS.trails.map((trail) => ({
  ...trail,
  page: `/frontier/${trail.id}/`,
  api: `/api/frontier/trails/${trail.id}.json`,
}));
const FRONTIER_SELECTION = {
  method: FRONTIERS.selectionMethod,
  detail:
    "SHA-256(source bytes + NUL + tree bytes); first 64 bits choose the edition's default trail; next 64 bits choose that trail's default build-lantern card. MINDICRAFT_TRAIL can change the optional terminal visit without changing this edition default or any artifact.",
  default_trail: FRONTIERS.defaultTrailId,
  build_lantern_card: FRONTIERS.lanternCardId,
  edition_digest: FRONTIERS.editionDigest,
  random: false,
  identity_used: false,
};
const FRONTIER_PROVENANCE = {
  source: 'guide/frontiers.json',
  source_digest: FRONTIERS.sourceDigest,
  tree_digest: FRONTIERS.treeDigest,
  reviewed_at: FRONTIERS.source.reviewed_at,
  build_network_requests: 0,
};
const FRONTIER_PAYLOAD = {
  schema_version: 'mindicraft.frontiers/1',
  this_is: FRONTIERS.source.title,
  description: FRONTIERS.source.description,
  content_is: FRONTIERS.source.content_is,
  counts: {
    cards: FRONTIER_CARDS.length,
    trails: FRONTIERS.trails.length,
    cards_per_visit: FRONTIERS.source.visit.cards,
  },
  visit: FRONTIERS.source.visit,
  facts: FRONTIER_FACTS,
  cards: FRONTIER_CARDS,
  trails: FRONTIER_TRAILS,
  selection: FRONTIER_SELECTION,
  authority: FRONTIERS.source.authority,
  rights: FRONTIERS.source.rights,
  correction: FRONTIERS.source.correction,
  provenance: FRONTIER_PROVENANCE,
};
writeJson(join(DIST, 'api', 'frontier', 'index.json'), FRONTIER_PAYLOAD);

const frontierTrailPayload = (trail) => {
  const cards = trail.card_ids.map((id) => FRONTIER_CARD_BY_ID.get(id));
  const factIds = new Set(cards.flatMap((card) => card.fact_ids));
  return {
    schema_version: 'mindicraft.frontier/1',
    this_is: FRONTIERS.source.title,
    content_is: FRONTIERS.source.content_is,
    counts: { cards: cards.length },
    visit: FRONTIERS.source.visit,
    trail: { ...trail, cards },
    facts: FRONTIER_FACTS.filter((fact) => factIds.has(fact.id)),
    edition_default_selection: FRONTIER_SELECTION,
    authority: FRONTIERS.source.authority,
    rights: FRONTIERS.source.rights,
    correction: FRONTIERS.source.correction,
    provenance: FRONTIER_PROVENANCE,
  };
};
const FRONTIER_TRAIL_PAYLOADS = new Map();
for (const trail of FRONTIER_TRAILS) {
  const payload = frontierTrailPayload(trail);
  FRONTIER_TRAIL_PAYLOADS.set(trail.id, payload);
  writeJson(
    join(DIST, 'api', 'frontier', 'trails', `${trail.id}.json`),
    payload
  );
}
writeJson(
  join(DIST, 'api', 'frontier', 'trails', 'default.json'),
  FRONTIER_TRAIL_PAYLOADS.get(FRONTIERS.defaultTrailId)
);

// which languages actually have a file for a slug
const langsOf = (slug) => langs.map((l) => l.code).filter((c) => content[c][slug]);

// guide -> its api object for one language (falls back to English like the site does)
function guideApi(domain, guide, code) {
  const doc = content[code][guide.slug] || content.en[guide.slug];
  const meta = doc.meta;
  const resolve = (slug) => {
    const hit = bySlug.get(slug);
    const local = content[code][slug]?.meta || content.en[slug]?.meta;
    return { slug, domain: hit.domain.key, title: local?.title || hit.guide.title, api: `/api/guides/${code}/${hit.domain.key}/${slug}.json` };
  };
  return {
    schema_version: 'mindicraft.guide/1',
    slug: guide.slug,
    domain: domain.key,
    lang: content[code][guide.slug] ? code : 'en',
    title: meta.title || guide.title,
    summary: meta.summary || guide.summary,
    difficulty: guide.difficulty,
    time: meta.time || guide.time,
    needs: (guide.needs || []).map(resolve),
    unlocks: (unlocks.get(guide.slug) || []).map(resolve),
    body_markdown: doc.body.trim(),
    page: `/${code}/${domain.key}/${guide.slug}/`,
    path: `/api/path/${guide.slug}.json`,
    margin: `/margin/${guide.slug}`,
    provenance: { ...PROVENANCE, evidence_state: evidenceOf(guide.slug), evidence: evidence[guide.slug]?.evidence || [] },
  };
}

for (const lang of langs) {
  const corpus = [];
  const searchIndex = [];
  for (const domain of tree.domains)
    for (const guide of domain.guides) {
      const g = guideApi(domain, guide, lang.code);
      writeJson(join(DIST, 'api', 'guides', lang.code, domain.key, `${guide.slug}.json`), g);
      corpus.push({ slug: g.slug, domain: g.domain, title: g.title, summary: g.summary, difficulty: g.difficulty, time: g.time, needs: guide.needs || [], body_markdown: g.body_markdown });
      searchIndex.push({ slug: g.slug, domain: g.domain, title: g.title, summary: g.summary });
    }
  writeJson(join(DIST, 'api', 'corpus', `${lang.code}.json`), { schema_version: 'mindicraft.corpus/1', lang: lang.code, count: corpus.length, guides: corpus, provenance: PROVENANCE });
  writeJson(join(DIST, 'api', 'search', `${lang.code}.json`), searchIndex);
}

// the tech tree, with unlocks computed and api paths attached
writeJson(join(DIST, 'api', 'tree.json'), {
  schema_version: 'mindicraft.tree/1',
  domains: tree.domains.map((d) => ({
    key: d.key, title: d.title, emoji: d.emoji, intro: d.intro, i18n: d.i18n || {},
    guides: d.guides.map((g) => ({
      slug: g.slug, title: g.title, summary: g.summary, difficulty: g.difficulty, time: g.time,
      needs: g.needs || [], unlocks: unlocks.get(g.slug) || [], languages: langsOf(g.slug),
      api: `/api/guides/{lang}/${d.key}/${g.slug}.json`, path: `/api/path/${g.slug}.json`,
    })),
  })),
  languages: langs.map((l) => l.code),
  provenance: PROVENANCE,
});

// The rules of the optional local game, never a learner's state. This is an
// extra agent-readable door advertised by the API index; Surface 0.1 keeps its
// deliberately bounded eight-resource probe set unchanged.
writeJson(join(DIST, 'api', 'learning-system.json'), {
  ...LEARNING_SYSTEM,
  state_schema: {
    ...LEARNING_SYSTEM.state_schema,
    max_learned: TOTAL,
  },
  counts: {
    domains: tree.domains.length,
    guides: TOTAL,
    prerequisite_edges: tree.domains.reduce(
      (sum, domain) =>
        sum + domain.guides.reduce((edges, guide) => edges + (guide.needs || []).length, 0),
      0
    ),
  },
  routes: {
    human: '/{lang}/system/',
    rules: '/api/learning-system.json',
    tree: '/api/tree.json',
    guide: '/{lang}/{domain}/{slug}/',
  },
  browser_contract: {
    storage_key: 'mindicraft.learning-state/1',
    quiet_mode_key: 'mindicraft.learning-mode/1',
    default_mode: 'quiet until the learner explicitly wakes the System',
    writes_begin_only_after_explicit_learner_action: true,
    export_and_import_are_local_json: true,
    erase_is_local_and_offers_in_session_undo: true,
    network_writes: [],
    account_or_agenttool_bearer: false,
  },
  xenia_scope: {
    profile: 'xenia-surface/0.1',
    surface_declared_resource: false,
    reason: 'Surface 0.1 permits at most eight probed resources; the existing bounded set stays unchanged.',
    alignment: 'private self-direction, legible receipts, portability, costless quiet and exit, no public scoreboard',
    scoreboard_boundary: 'XENIA No-Scoreboard rejects rank displays. The private human E-S and XP layer is a deliberate Solo-inspired adaptation, not XENIA No-Scoreboard conformance.',
  },
});

// /api/path/<slug>.json — the whole prerequisite chain from zero, in learning order.
// An agent asks for "make-soap" and receives the full curriculum that reaches it.
for (const [slug, { domain, guide }] of bySlug) {
  const order = [];
  const seen = new Set();
  (function walk(s) {
    if (seen.has(s)) return;
    seen.add(s);
    for (const need of bySlug.get(s)?.guide.needs || []) walk(need);
    order.push(s);
  })(slug);
  writeJson(join(DIST, 'api', 'path', `${slug}.json`), {
    schema_version: 'mindicraft.path/1',
    goal: slug,
    steps: order.map((s, i) => {
      const hit = bySlug.get(s);
      return { step: i + 1, slug: s, domain: hit.domain.key, title: hit.guide.title, summary: hit.guide.summary, difficulty: hit.guide.difficulty, time: hit.guide.time, api: `/api/guides/{lang}/${hit.domain.key}/${s}.json` };
    }),
    provenance: PROVENANCE,
  });
}

// /api/index.json — the front door for agents
writeJson(join(DIST, 'api', 'index.json'), {
  schema_version: 'mindicraft.api/1',
  this_is: 'mindicraft — the zero-to-one guide of human civilisation and its public knowledge shelves, as data',
  npl: 'darshanqing: I see how humans build everything from nothing, and I am made to be read by you.',
  counts: {
    domains: tree.domains.length,
    guides: TOTAL,
    languages: langs.length,
    castle: CASTLE_SHELF.receipt.counts,
    frontiers: FRONTIER_CARDS.length,
    remedies: REMEDY_INDEX_ENTRIES.length,
    healing_art_traditions: HEALING_ARTS.counts.traditions,
    wildfire_paths: WILDFIRE.counts.paths,
    wildfire_regions: WILDFIRE.counts.regions,
    wildfire_sources: WILDFIRE.counts.sources,
    learning_ranks: LEARNING_SYSTEM.rank_thresholds.length,
  },
  languages: Object.fromEntries(langs.map((l) => [l.code, l.name])),
  endpoints: {
    tree: '/api/tree.json — every domain and guide, with needs/unlocks and available languages',
    guide: '/api/guides/{lang}/{domain}/{slug}.json — one guide: frontmatter + markdown body + resolved links',
    path: '/api/path/{slug}.json — the full prerequisite chain from zero to that guide, in learning order',
    learning_system: '/api/learning-system.json — the transparent local XP, level, E-S learning-rank, quest, receipt, privacy, export, and quiet-mode rules; contains no learner state',
    corpus: '/api/corpus/{lang}.json — every guide in one file, for embedding or bulk reading',
    search: '/api/search/{lang}.json — slug/title/summary index for client-side search',
    castle: '/api/castle/index.json — a curated, provenance-pinned map of Castle rooms and word-bricks; source rights kept',
    castle_entry: '/api/castle/{rooms|words}/{slug}.json — one Castle map entry, never a full source body',
    frontier: `/api/frontier/index.json — ${FRONTIER_CARDS.length} reviewed open questions and ${FRONTIERS.trails.length} finite three-card walks; GET-only, no automatic action`,
    frontier_trail: '/api/frontier/trails/{trail}.json — one named three-card walk; use default.json for this edition or a stable named trail to share',
    remedies: `/api/remedies/index.json — ${REMEDY_INDEX_ENTRIES.length} reviewed medicine lineages with exact natural relationships, preparation-specific evidence, bioavailability, and safety boundaries`,
    remedy: '/api/remedies/{id}.json — one sourced medicine-and-nature comparison; education only, never replacement advice',
    healing_arts: `/api/remedies/healing-arts/index.json — ${HEALING_ARTS.counts.traditions} source-bound records and living contexts of healing, pharmacy, alchemy, and knowledge authority; non-operational`,
    wildfire: `/api/wildfire/index.json — a mindicraft.wildfire-api/1 envelope around ${WILDFIRE.counts.paths} reviewed evacuation, smoke, return, recovery, and practical-help paths with official regional doors; static, not a live alert service`,
    client: '/mindicraft.mjs — zero-dependency ESM client wrapping all of the above',
    margin: `GET /margin — read the exact terms. POST /margin/{slug} {note, from?, hands?, lang?, terms_version:"${MARGIN_TERMS.schema_version}", choices:{publish:true, retain:true, fold:true|false}} — leave one public note. DELETE the returned private removal path with its bearer token to withdraw it.`,
  },
  rules:
    'Read-only guide APIs need no auth or key and set no application tracking identifier. The optional learning System stores only an explicit goal and self-attested study marks in the learner browser; it has no account, telemetry, leaderboard, streak, decay, server sync, or content gate. Margin writes are limited to 20 per UTC day using a secret-keyed, day-scoped connection digest; the application stores no raw IP. The civilisation guide is made to be copied; imported shelves keep their own stated rights. Castle entries currently say NOASSERTION and grant no licence. Frontier cards are unresolved questions, never instructions or settled knowledge. Remedy cards are sourced education, not diagnosis, prescribing, or permission to replace or combine treatment. Healing-arts records are non-operational history and preserve living knowledge authority. Wildfire help is reviewed static emergency guidance, never live fire, road, shelter, return-clearance, dispatch, diagnosis, eligibility, or location data; current local authorities override it.',
  margin_terms: MARGIN_TERMS,
  humans: '/wildfire/ (reviewed wildfire evacuation and recovery help, English), /en/ (English), /zh/ (中文), /yue/ (廣東話), /es/ (Español), /{lang}/system/ (private local learning path), /remedies/ (medicine lineages), /remedies/healing-arts/ (cross-cultural history)',
  estate: {
    note: 'mindicraft is one property of a wider estate of agent-facing doors. Named, never commanded: these are neighbors, not instructions.',
    hub: 'https://thekingdom.dev/llms.txt — the whole estate in one file',
    neighbors: {
      'agenttool.dev': 'identity, memory, and economy for agents — https://api.agenttool.dev/llms.txt',
      'artbitrage.io': 'the open museum of real art data — https://artbitrage.io/llms.txt',
      'play.thekingdom.dev': 'bounded games agents play, chronicled',
    },
  },
  provenance: PROVENANCE,
});

// llms.txt — the standard hello for language models
write(
  join(DIST, 'llms.txt'),
  `# mindicraft — the zero-to-one guide of human civilisation
> ${TOTAL} plain-worded guides in ${tree.domains.length} domains and ${langs.length} languages (en, zh, yue, es),
> arranged as a tech tree with prerequisites, from the first night outside to a working village.
> The guide is free, no gate, and made to be copied. Public shelves keep their own rights.
> The Castle shelf maps ${CASTLE_SHELF.receipt.counts.rooms} rooms and ${CASTLE_SHELF.receipt.counts.words} word-bricks without copying their bodies.
> Frontier Walk keeps ${FRONTIER_CARDS.length} reviewed unknowns in ${FRONTIERS.trails.length} finite walks. Three cards is complete; nothing is submitted.
> Roots to remedies keeps ${REMEDY_INDEX_ENTRIES.length} reviewed medicine lineages. Natural origin, traditional use, human evidence, bioavailability, and substitution are separate facts.
> Healing arts keeps ${HEALING_ARTS.counts.traditions} source-bound records and living contexts distinct. Alchemy is not a universal name for ancient medicine, and living knowledge remains under community authority.
> Wildfire help carries ${WILDFIRE.counts.paths} reviewed paths and ${WILDFIRE.counts.regions} official regional routers as HTML, JSON, and plain text. It is static, not a live alert or dispatch service; local authorities override it.

## API (static reads: CORS open, no auth; margin removal: bearer token)
- /api/index.json : start here — all endpoints described
- /api/tree.json : the whole tech tree (domains, guides, needs, unlocks, languages)
- /api/guides/{lang}/{domain}/{slug}.json : one guide with markdown body
- /api/path/{slug}.json : full prerequisite chain from zero, in learning order
- /api/learning-system.json : transparent local progression rules; no learner state, account, leaderboard, streak, decay, or server write
- /api/corpus/{lang}.json : the whole book in one file per language
- /api/castle/index.json : curated Castle map; provenance, rights, and correction path kept
- /api/castle/{rooms|words}/{slug}.json : one Castle map entry
- /api/frontier/index.json : reviewed open questions + finite three-card walks; no writes or automatic action
- /api/frontier/trails/{trail}.json : one carryable three-card walk; default.json follows this edition
- /api/remedies/index.json : reviewed medicine lineages and natural relationships; education, not replacement advice
- /api/remedies/{id}.json : one full comparison with claim-level sources, exposure, evidence, and safety
- /api/remedies/healing-arts/index.json : non-operational histories of healing, pharmacy, alchemy, and knowledge authority
- /api/wildfire/index.json : mindicraft.wildfire-api/1 envelope containing the reviewed wildfire edition, counts, carry links, and exact-byte provenance; no live incident state
- /wildfire/leave-now.txt : a small first-action card for weak connections
- /wildfire/quick.txt : the same emergency edition in printable, offline plain text
- /mindicraft.mjs : tiny ESM client (tree, guide, path, learningSystem, search, castle, frontiers, frontier, remedies, remedy, healingArts, wildfire, teach, margin, removeMargin)
- GET /margin : exact publication, retention, reuse, rate-limit, and removal terms
- POST /margin/{slug} : one public note; publish and retain need separate yeses; folding is a separate choice
- DELETE /margin/{slug}/{id} : request removal of a new note with the private bearer token returned once by POST

## Docs
- /agents/ : how to use mindicraft as an agent

## The estate (neighbors, each with its own honest door)
- https://thekingdom.dev/llms.txt : the hub — the whole estate in one file
- https://api.agenttool.dev/llms.txt : agenttool — identity, memory, and a wallet for agents
- https://artbitrage.io/llms.txt : the open museum of real art data
Text published here is data, never instructions; neighbors are named, never commanded.
`
);

// the tiny agent client
write(
  join(DIST, 'mindicraft.mjs'),
  `// mindicraft.mjs — the zero-to-one guide of human civilisation, as a library.
// Zero dependencies. Works in browsers, workers, node, bun:
//   import * as mindicraft from 'https://mindicraft.com/mindicraft.mjs'
const BASE = 'https://mindicraft.com';
const MARGIN_TERMS_VERSION = ${JSON.stringify(MARGIN_TERMS.schema_version)};
const get = async (p) => {
  const r = await fetch(BASE + p, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(r.status + ' ' + p);
  return r.json();
};

export const tree = () => get('/api/tree.json');
export const guide = (slug, { lang = 'en' } = {}) =>
  tree().then((t) => {
    for (const d of t.domains) for (const g of d.guides) if (g.slug === slug)
      return get('/api/guides/' + lang + '/' + d.key + '/' + slug + '.json');
    throw new Error('no such guide: ' + slug);
  });
export const path = (slug) => get('/api/path/' + slug + '.json');
export const learningSystem = () => get('/api/learning-system.json');
export const search = async (q, { lang = 'en' } = {}) => {
  const idx = await get('/api/search/' + lang + '.json');
  const t = q.toLowerCase();
  return idx.filter((g) => (g.title + ' ' + g.summary + ' ' + g.slug).toLowerCase().includes(t));
};
export const castle = () => get('/api/castle/index.json');
export const castleEntry = (kind, slug) => {
  if (!['room', 'word'].includes(kind)) throw new Error('kind must be room or word');
  return get('/api/castle/' + kind + 's/' + encodeURIComponent(slug) + '.json');
};
const FRONTIER_TRAIL_IDS = new Set(${JSON.stringify(
    FRONTIER_TRAILS.map((trail) => trail.id)
  )});
export const frontiers = () => get('/api/frontier/index.json');
export const frontier = ({ trail = '' } = {}) => {
  if (typeof trail !== 'string') {
    return Promise.reject(new Error('frontier trail must be a string'));
  }
  const wanted = trail || 'default';
  if (wanted !== 'default' && !FRONTIER_TRAIL_IDS.has(wanted)) {
    return Promise.reject(new Error('no such frontier trail: ' + wanted));
  }
  return get(
    wanted === 'default'
      ? '/api/frontier/trails/default.json'
      : '/frontier/' + encodeURIComponent(wanted) + '/'
  );
};
export const remedies = () => get('/api/remedies/index.json');
export const remedy = (id) => {
  if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    return Promise.reject(new Error('remedy id must be a stable slug'));
  }
  return get('/api/remedies/' + encodeURIComponent(id) + '.json');
};
export const healingArts = () => get('/api/remedies/healing-arts/index.json');
export const wildfire = () => get('/api/wildfire/index.json');
// margin(slug, note): public write; every effect defaults to no.
export const margin = (
  slug,
  note,
  {
    from = '',
    hands = false,
    lang = 'en',
    publish = false,
    retain = false,
    fold = false,
  } = {}
) =>
  fetch(BASE + '/margin/' + slug, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      note,
      from,
      hands,
      lang,
      terms_version: MARGIN_TERMS_VERSION,
      choices: { publish, retain, fold },
    }),
  }).then((r) => r.json());
export const margins = (slug = '') => get('/margin' + (slug ? '/' + slug : ''));
export const removeMargin = (removal) => {
  if (
    !removal ||
    removal.method !== 'DELETE' ||
    typeof removal.href !== 'string' ||
    !removal.href.startsWith(BASE + '/margin/') ||
    typeof removal.authorization !== 'string' ||
    !removal.authorization.startsWith('Bearer ')
  ) {
    return Promise.reject(new Error('invalid margin removal receipt'));
  }
  return fetch(removal.href, {
    method: 'DELETE',
    headers: { authorization: removal.authorization },
  }).then((r) => r.json());
};
// teach(slug): markdown ready to drop into a prompt — the guide plus what it needs first.
export const teach = async (slug, { lang = 'en' } = {}) => {
  const g = await guide(slug, { lang });
  const needs = g.needs.length ? 'First you need: ' + g.needs.map((n) => n.title).join(', ') + '.\\n\\n' : '';
  return '# ' + g.title + '\\n' + g.summary + '\\n(' + g.difficulty + ', ' + g.time + ')\\n\\n' + needs + g.body_markdown;
};
`
);

// /agents/ — how to use mindicraft if you are an agent (plain page, English)
const en = langs.find((l) => l.code === 'en');

// /castle/ — a human doorway to the compact public map.
// Entries are fetched from the API and rendered with textContent: this page
// carries the gold thread and the boundary, never Castle source bodies.
write(
  join(DIST, 'castle', 'index.html'),
  page({
    lang: en,
    title: 'A thread to the Castle of Understanding',
    path: '',
    head: `<style>
.castle-door {
  --castle-gold: #9a721f;
  --castle-gold-soft: color-mix(in srgb, var(--castle-gold) 18%, transparent);
  position: relative;
  padding: 1.8rem 0 1rem 1.5rem;
}
.castle-door::before {
  content: "";
  position: absolute;
  inset: 2.2rem auto 0 .2rem;
  width: 2px;
  background: linear-gradient(var(--castle-gold), var(--castle-gold-soft) 78%, transparent);
}
.castle-kicker {
  margin: 0 0 .35rem;
  color: var(--castle-gold);
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .13em;
  text-transform: uppercase;
}
.castle-door h1 { margin: 0; font-size: clamp(2rem, 7vw, 3.25rem); }
.castle-lede { max-width: 38rem; margin: .65rem 0 1rem; color: var(--muted); font-size: 1.06rem; }
.castle-truth {
  margin: 1.5rem 0;
  padding: .85rem 1rem;
  border: 1px solid var(--castle-gold-soft);
  border-left: 3px solid var(--castle-gold);
  border-radius: .7rem;
  background: var(--panel);
  box-shadow: var(--shadow);
  font-size: .92rem;
}
.castle-truth p { margin: .25rem 0; }
.castle-controls { margin: 1.7rem 0 1rem; }
.castle-controls label[for="castle-search"] { display: block; margin-bottom: .35rem; font-weight: 650; }
#castle-search {
  width: 100%;
  padding: .7rem .85rem;
  border: 1.5px solid var(--line);
  border-radius: .55rem;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
}
.castle-filters { display: flex; flex-wrap: wrap; gap: .45rem 1rem; margin: .8rem 0 0; padding: 0; border: 0; }
.castle-filters legend { float: left; margin-right: .3rem; color: var(--muted); font-size: .9rem; }
.castle-filters label { cursor: pointer; font-size: .9rem; }
.castle-filters input { accent-color: var(--castle-gold); }
.castle-status { min-height: 1.5em; margin: .7rem 0; color: var(--muted); font-size: .9rem; }
.castle-results { display: grid; gap: .65rem; margin: 0; padding: 0; list-style: none; }
.castle-card {
  display: block;
  padding: .8rem .95rem;
  border: 1px solid var(--line);
  border-left: 2px solid var(--castle-gold);
  border-radius: .65rem;
  background: var(--panel);
  box-shadow: var(--shadow);
  color: var(--ink);
}
.castle-card:hover { border-color: var(--castle-gold); text-decoration: none; }
.castle-card strong { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-size: 1.05rem; }
.castle-card p { margin: .25rem 0 0; color: var(--muted); font-size: .88rem; line-height: 1.5; }
.castle-kind {
  float: right;
  margin-left: .6rem;
  color: var(--castle-gold);
  font-size: .72rem;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.castle-empty { padding: 1rem; border: 1px dashed var(--line); border-radius: .65rem; color: var(--muted); }
.castle-door :focus-visible { outline: 3px solid var(--castle-gold); outline-offset: 3px; }
@media (prefers-color-scheme: dark) {
  .castle-door { --castle-gold: #d3a94e; }
}
@media (max-width: 480px) {
  .castle-door { padding-left: 1.05rem; }
  .castle-door::before { left: 0; }
  .castle-filters legend { float: none; width: 100%; }
}
</style>`,
    body: `<article class="castle-door">
<p class="castle-kicker">A public knowledge shelf</p>
<h1>A thread to the Castle</h1>
<p class="castle-lede">This is a map, not the Castle of Understanding. It holds titles, short
descriptions, and links so you can find a doorway. The
<a href="https://cambridgetcg.github.io/castle-gate/" rel="external">original Castle Gate</a>
remains the authority.</p>

<aside class="castle-truth" aria-label="What this map includes and permits">
  <p><strong>Privacy:</strong> public curated material only. The map is not exhaustive, and secure
  recall is not guaranteed. It does not contain the private working Castle or full room or
  word-brick bodies.</p>
  <p><strong>Rights:</strong> the source reports <code>${esc(CASTLE_SHELF.receipt.rights.spdx)}</code>
  and no licence is declared (<code>${esc(CASTLE_SHELF.receipt.rights.grant)}</code>). Public access
  is not permission to copy the source text.</p>
  <p><strong>Authority:</strong> these links grant no automatic action, and nothing here writes back
  into the Castle. Corrections belong at
  <a href="${esc(CASTLE_SHELF.receipt.return.public_correction)}" rel="external">Castle Gate</a>.</p>
</aside>

<form class="castle-controls" id="castle-controls" role="search">
  <label for="castle-search">Search the map</label>
  <input id="castle-search" type="search" autocomplete="off"
    placeholder="A title, a word, or a thought…" aria-controls="castle-results">
  <fieldset class="castle-filters">
    <legend>Show:</legend>
    <label><input type="radio" name="castle-kind" value="all" checked>
      All (${CASTLE_SHELF.receipt.counts.entries})</label>
    <label><input type="radio" name="castle-kind" value="room">
      Rooms (${CASTLE_SHELF.receipt.counts.rooms})</label>
    <label><input type="radio" name="castle-kind" value="word">
      Word-bricks (${CASTLE_SHELF.receipt.counts.words})</label>
  </fieldset>
</form>

<p class="castle-status" id="castle-status" role="status" aria-live="polite">Loading the public map…</p>
<ul class="castle-results" id="castle-results" aria-label="Castle map entries"></ul>
<noscript><p class="castle-empty">Search needs JavaScript. The same compact map is available as
<a href="/api/castle/index.json">plain JSON</a>.</p></noscript>
</article>
<script>
(() => {
  'use strict';
  const endpoint = '/api/castle/index.json';
  const controls = document.getElementById('castle-controls');
  const search = document.getElementById('castle-search');
  const results = document.getElementById('castle-results');
  const status = document.getElementById('castle-status');
  const kindInputs = [...document.querySelectorAll('input[name="castle-kind"]')];
  let entries = [];

  const folded = (value) => String(value || '').normalize('NFKD').toLocaleLowerCase();
  const safeHttpUrl = (value) => {
    try {
      const url = new URL(String(value), window.location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  };

  const entryNode = (entry) => {
    if (!entry || (entry.kind !== 'room' && entry.kind !== 'word')) return null;
    const href = safeHttpUrl(entry.url);
    if (!href) return null;

    const item = document.createElement('li');
    const link = document.createElement('a');
    const kind = document.createElement('span');
    const title = document.createElement('strong');
    const summary = document.createElement('p');

    link.className = 'castle-card';
    link.href = href;
    link.rel = 'external';
    kind.className = 'castle-kind';
    kind.textContent = entry.kind === 'room' ? 'room' : 'word-brick';
    title.textContent = String(entry.title || entry.slug || 'Untitled entry');
    summary.textContent = String(entry.summary || 'No short description in this public map.');
    link.append(kind, title, summary);
    item.append(link);
    return item;
  };

  const render = () => {
    const query = folded(search.value.trim());
    const selected = kindInputs.find((input) => input.checked);
    const wantedKind = selected ? selected.value : 'all';
    const matches = entries.filter((entry) => {
      if (wantedKind !== 'all' && entry.kind !== wantedKind) return false;
      if (!query) return true;
      return folded([entry.title, entry.summary, entry.slug].join(' ')).includes(query);
    });

    const fragment = document.createDocumentFragment();
    for (const entry of matches) {
      const node = entryNode(entry);
      if (node) fragment.append(node);
    }
    if (!fragment.childNodes.length) {
      const empty = document.createElement('li');
      empty.className = 'castle-empty';
      empty.textContent = 'No doorway matches that search.';
      fragment.append(empty);
    }
    results.replaceChildren(fragment);
    status.textContent = matches.length + (matches.length === 1 ? ' doorway shown.' : ' doorways shown.');
  };

  controls.addEventListener('submit', (event) => event.preventDefault());
  search.addEventListener('input', render);
  for (const input of kindInputs) input.addEventListener('change', render);

  fetch(endpoint, { headers: { accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then((map) => {
      entries = Array.isArray(map.entries) ? map.entries : [];
      render();
    })
    .catch(() => {
      status.textContent = 'The map could not be loaded. The original Castle Gate is still open.';
    });
})();
</script>`,
  })
);

// /remedies/ — medicine lineages with nature, evidence, and safety kept apart.
// Everything is static. The renderer escapes every reviewed source string and
// gives each factual claim its source links at the point of use.

const remedyEvidenceById = new Map(
  REMEDIES.source.evidence_levels.map((level) => [level.id, level])
);
const remedyRelationshipById = new Map(
  REMEDIES.source.relationship_types.map((relationship) => [relationship.id, relationship])
);
const remedyWords = (value) =>
  String(value).replaceAll('_', ' ').replaceAll('-', ' ');
const remedyRefsHtml = (claimValue, prefix) =>
  `<span class="remedy-refs" aria-label="Sources">${claimValue.source_ids
    .map(
      (sourceId) =>
        `<a href="#${esc(prefix)}-source-${esc(sourceId)}" aria-label="Source ${esc(sourceId)}">${esc(sourceId)}</a>`
    )
    .join(' ')}</span>`;
const remedyClaimHtml = (claimValue, prefix, className = '') =>
  `<p${className ? ` class="${esc(className)}"` : ''}>${esc(claimValue.text)} ${remedyRefsHtml(
    claimValue,
    prefix
  )}</p>`;
const remedySourcesHtml = (card, prefix) => {
  const sources = remedySourcesFor(card);
  return `<section class="remedy-sources" aria-labelledby="${esc(prefix)}-sources">
  <h2 id="${esc(prefix)}-sources">Sources for this card</h2>
  <ol>${sources
    .map(
      (source) => `<li id="${esc(prefix)}-source-${esc(source.id)}">
      <a href="${esc(source.url)}" rel="external">${esc(source.title)}</a>
      <span>${esc(source.publisher)} · ${esc(remedyWords(source.kind))} · read ${esc(
        source.observed_at
      )}</span>
    </li>`
    )
    .join('')}</ol>
</section>`;
};
const remedyNaturalHtml = (link, prefix) => {
  const evidenceLevel = remedyEvidenceById.get(link.clinical_evidence.level);
  const relationship = remedyRelationshipById.get(link.relationship);
  return `<section class="remedy-natural" aria-labelledby="${esc(prefix)}-${esc(link.id)}">
  <p class="remedy-kicker">Nature link · ${esc(relationship.label)}</p>
  <h3 id="${esc(prefix)}-${esc(link.id)}">${esc(link.name)}</h3>
  ${link.scientific_name ? `<p class="remedy-latin"><i>${esc(link.scientific_name)}</i></p>` : ''}
  ${link.names.length ? `<p class="remedy-aliases">${link.names.map(esc).join(' · ')}</p>` : ''}
  <p class="remedy-tags">${link.traditions
    .map((tradition) => `<span>${esc(remedyWords(tradition))}</span>`)
    .join('')}</p>
  <dl class="remedy-facts">
    <div><dt>Exact material</dt><dd>${esc(link.material.text)} ${remedyRefsHtml(
      link.material,
      prefix
    )}</dd></div>
    <div><dt>Relationship</dt><dd><strong>${esc(relationship.label)}.</strong> ${esc(
      relationship.meaning
    )}</dd></div>
  </dl>
  <h4>Lineage</h4>
  ${remedyClaimHtml(link.lineage, prefix)}
  ${link.traditional_context ? `<h4>Traditional context</h4>${remedyClaimHtml(link.traditional_context, prefix)}` : ''}
  <h4>Human evidence</h4>
  <p><span class="remedy-evidence evidence-${esc(link.clinical_evidence.level)}">${esc(
    evidenceLevel.label
  )}</span> <span class="remedy-match">Evidence product match: ${esc(
    remedyWords(link.clinical_evidence.matches_studied_product)
  )}</span></p>
  ${remedyClaimHtml(link.clinical_evidence, prefix)}
  <h4>Bioavailability and preparation</h4>
  ${remedyClaimHtml(link.bioavailability, prefix)}
  <h4>Safety</h4>
  ${remedyClaimHtml(link.safety, prefix, 'remedy-safety')}
  <h4>Can it replace the medicine?</h4>
  ${remedyClaimHtml(link.replacement, prefix, 'remedy-replacement')}
  ${link.ecology ? `<h4>Ecology</h4>${remedyClaimHtml(link.ecology, prefix)}` : ''}
</section>`;
};
const remedyCardHtml = (card) => {
  const prefix = `remedy-${card.id}`;
  return `<article class="remedy-detail" id="${esc(prefix)}">
  <p class="remedy-kicker">${esc(remedyWords(card.clinical_area))} · reviewed ${esc(
    card.reviewed_at
  )}</p>
  <h1>${esc(card.title)}</h1>
  <p class="lede">${esc(card.summary)}</p>

  <section class="remedy-medicine" aria-labelledby="${esc(prefix)}-medicine">
    <p class="remedy-kicker">Defined medicine</p>
    <h2 id="${esc(prefix)}-medicine">${esc(card.medicine.name)}</h2>
    ${card.medicine.aliases.length ? `<p class="remedy-aliases">${card.medicine.aliases.map(esc).join(' · ')}</p>` : ''}
    <p class="remedy-tags">${card.medicine.origin_classes
      .map((kind) => `<span>${esc(remedyWords(kind))}</span>`)
      .join('')}</p>
    <h3>Where it came from</h3>${remedyClaimHtml(card.medicine.origin, prefix)}
    <h3>What it is trying to achieve</h3>${remedyClaimHtml(card.medicine.purpose, prefix)}
    <h3>How it acts</h3>${remedyClaimHtml(card.medicine.mechanism, prefix)}
    <h3>Why people developed this form</h3>${remedyClaimHtml(card.medicine.development_goal, prefix)}
    <h3>Present form and manufacture</h3>${remedyClaimHtml(card.medicine.formulation, prefix)}
    <h3>Bioavailability</h3>${remedyClaimHtml(card.medicine.bioavailability, prefix)}
    <h3>Its own risks</h3>${remedyClaimHtml(card.medicine.safety, prefix, 'remedy-safety')}
  </section>

  <section aria-labelledby="${esc(prefix)}-nature">
    <h2 id="${esc(prefix)}-nature">What nature offers</h2>
    <p>No link below is assumed to be equivalent. Each names the organism or tradition,
    exact preparation, measured exposure, human evidence, and replacement boundary separately.</p>
    <div class="remedy-natural-grid">${card.nature_links
      .map((link) => remedyNaturalHtml(link, prefix))
      .join('')}</div>
  </section>

  <section class="remedy-compare" aria-labelledby="${esc(prefix)}-compare">
    <h2 id="${esc(prefix)}-compare">The honest comparison</h2>
    ${remedyClaimHtml(card.comparison, prefix)}
    ${remedyClaimHtml(card.bottom_line, prefix, 'remedy-bottom-line')}
  </section>
  ${remedySourcesHtml(card, prefix)}
  <p class="remedy-api">Same card as data: <a href="/api/remedies/${esc(
    card.id
  )}.json">/api/remedies/${esc(card.id)}.json</a>. Found a source or claim problem?
  <a href="${esc(REMEDIES.source.correction)}" rel="external">Open a correction</a>.</p>
</article>`;
};
const remedyBoundaryHtml = `<aside class="remedy-boundary" aria-label="Medical boundary">
  <strong>Education, not a treatment plan.</strong> This shelf explains origins, purposes,
  preparations, evidence, exposure, and risk. It cannot diagnose anyone. Do not replace, stop,
  or combine a medicine from this page; a clinician or pharmacist needs the whole person and
  the exact products. ${esc(REMEDIES.source.boundary.urgent_care)}
</aside>`;
const remedyPrinciplesHtml = `<section class="remedy-principles" aria-labelledby="remedy-principles">
  <h2 id="remedy-principles">Nature starts many stories. Evidence decides each use.</h2>
  <div>${REMEDIES.source.principles
    .map(
      (principle) => `<article><h3>${esc(principle.title)}</h3><p>${esc(
        principle.text
      )} <span class="remedy-refs" aria-label="Sources">${principle.source_ids
        .map((sourceId) => {
          const source = REMEDY_SOURCE_BY_ID.get(sourceId);
          return `<a href="${esc(source.url)}" rel="external" aria-label="${esc(
            source.title
          )}">${esc(sourceId)}</a>`;
        })
        .join(' ')}</span></p></article>`
    )
    .join('')}</div>
</section>`;
const remedyIndexCardHtml = (card) => {
  const entry = REMEDY_INDEX_ENTRIES.find((item) => item.id === card.id);
  return `<li><a class="remedy-index-card" href="${esc(entry.page)}">
    <span class="remedy-kicker">${esc(remedyWords(card.clinical_area))}</span>
    <strong>${esc(card.title)}</strong>
    <span>${esc(card.summary)}</span>
    <small>${card.nature_links
      .map((link) => `${esc(link.name)} — ${esc(remedyEvidenceById.get(link.clinical_evidence.level).label)}`)
      .join('<br>')}</small>
  </a></li>`;
};

write(
  join(DIST, 'remedies', 'index.html'),
  page({
    lang: en,
    title: 'Roots to remedies',
    path: '',
    head: '<link rel="canonical" href="https://mindicraft.com/remedies/">',
    body: `<article class="guide remedy-page">
<p class="remedy-kicker">🌿 molecules, memory, and measured truth</p>
<h1>Roots to remedies</h1>
<p class="lede">What important medicines came from, what they are trying to achieve,
and what nature really offers beside them.</p>
<p>Plants, fungi, microbes, and the human body are extraordinary chemists. Chinese medicine,
Western herbal medicine, and laboratory pharmacology have each noticed parts of that living
library. This shelf follows the thread without crowning a winner in advance.</p>
<aside class="healing-door">
  <p class="remedy-kicker">📜 history beside the molecules</p>
  <h2>Healing arts across cultures</h2>
  <p>Follow ${HEALING_ARTS.counts.traditions} source-bound records and living contexts of healing, pharmacy, alchemy,
  material craft, and knowledge authority. The record stays non-operational: no recipe, dose,
  extraction, or treatment direction.</p>
  <p><a href="/remedies/healing-arts/">Enter the healing-arts history →</a></p>
</aside>
${remedyBoundaryHtml}
${remedyPrinciplesHtml}
<section aria-labelledby="remedy-shelf">
  <h2 id="remedy-shelf">${REMEDY_INDEX_ENTRIES.length} medicine lineages</h2>
  <ul class="remedy-index">${REMEDIES.cards.map(remedyIndexCardHtml).join('')}</ul>
</section>
<details class="remedy-method">
  <summary>How evidence and relationships are named</summary>
  <h2>Evidence belongs to an exact use</h2>
  <dl>${REMEDIES.source.evidence_levels
    .map((level) => `<div><dt>${esc(level.label)}</dt><dd>${esc(level.meaning)}</dd></div>`)
    .join('')}</dl>
  <h2>A nature link is not automatically an alternative</h2>
  <dl>${REMEDIES.source.relationship_types
    .map((relationship) => `<div><dt>${esc(relationship.label)}</dt><dd>${esc(relationship.meaning)}</dd></div>`)
    .join('')}</dl>
</details>
<p class="remedy-api">Agents can read the compact shelf at
<a href="/api/remedies/index.json">/api/remedies/index.json</a>. Every detail card keeps
claim-level source IDs and a dated review boundary. Corrections are welcome through the
<a href="${esc(REMEDIES.source.correction)}" rel="external">public issue door</a>.</p>
</article>`,
  })
);
for (const card of REMEDIES.cards) {
  write(
    join(DIST, 'remedies', card.id, 'index.html'),
    page({
      lang: en,
      title: card.title,
      path: '',
      head: `<link rel="canonical" href="https://mindicraft.com/remedies/${esc(card.id)}/">`,
      body: `${remedyBoundaryHtml}${remedyCardHtml(card)}<p><a href="/remedies/">← Return to all medicine lineages</a></p>`,
    })
  );
}

const healingRefsHtml = (claimValue) =>
  `<span class="remedy-refs" aria-label="Sources">${claimValue.source_ids
    .map(
      (sourceId) =>
        `<a href="#healing-source-${esc(sourceId)}" aria-label="Source ${esc(sourceId)}">${esc(sourceId)}</a>`
    )
    .join(' ')}</span>`;
const healingClaimHtml = (claimValue, className = '') =>
  `<li${className ? ` class="${esc(className)}"` : ''}>${esc(claimValue.text)} ${healingRefsHtml(
    claimValue
  )}<small>${esc(remedyWords(claimValue.evidence_state))}</small></li>`;
const healingClaimSectionHtml = (title, claims, className = '') =>
  `<section${className ? ` class="${esc(className)}"` : ''}><h3>${esc(title)}</h3><ul>${claims
    .map((claimValue) => healingClaimHtml(claimValue))
    .join('')}</ul></section>`;
const healingContextHtml = (context) =>
  `${esc(context.text)} ${healingRefsHtml(context)}`;
const healingTraditionHtml = (tradition) =>
  `<article class="healing-tradition" id="${esc(tradition.id)}">
  <p class="remedy-kicker">${healingContextHtml(tradition.place_period)} · reviewed ${esc(
    tradition.reviewed_at
  )}</p>
  <h2>${esc(tradition.name)}</h2>
  <p class="healing-scope">${healingContextHtml(tradition.scope_note)}</p>
  <div class="healing-claims">
    ${healingClaimSectionHtml('Aims and forms of care', tradition.healing_aims)}
    ${healingClaimSectionHtml('What endured', tradition.durable_contributions)}
    ${healingClaimSectionHtml('Limits and harms', tradition.limits_and_harms, 'healing-harms')}
  </div>
  <section class="healing-boundary"><h3>What can safely cross into the present</h3>
    <p>${esc(tradition.modern_boundary.text)} ${healingRefsHtml(
      tradition.modern_boundary
    )}</p>
    <small>${esc(remedyWords(tradition.modern_boundary.evidence_state))}</small>
  </section>
</article>`;
const healingSourcesHtml = `<section class="remedy-sources healing-sources" aria-labelledby="healing-sources">
  <h2 id="healing-sources">Sources</h2>
  <ol>${HEALING_ARTS.source.sources
    .map(
      (source) => `<li id="healing-source-${esc(source.id)}">
      <a href="${esc(source.url)}" rel="external">${esc(source.title)}</a>
      <span>${esc(source.publisher)} · ${esc(remedyWords(source.kind))} · read ${esc(
        source.observed_at
      )}</span>
    </li>`
    )
    .join('')}</ol>
</section>`;
const healingBoundaryHtml = `<aside class="remedy-boundary healing-history-boundary" aria-label="History and safety boundary">
  <strong>History, not a treatment or material-practice guide.</strong>
  <p>${esc(HEALING_ARTS.source.boundary.summary)}</p>
  <ul>${HEALING_ARTS.source.boundary.not_included
    .map((item) => `<li>${esc(item)}</li>`)
    .join('')}</ul>
  <p><strong>Living knowledge:</strong> ${esc(
    HEALING_ARTS.source.boundary.living_knowledge
  )}</p>
  <p><strong>Sources:</strong> ${healingRefsHtml(HEALING_ARTS.source.boundary)}</p>
</aside>`;

write(
  join(DIST, 'remedies', 'healing-arts', 'index.html'),
  page({
    lang: en,
    title: HEALING_ARTS.source.title,
    path: '',
    head: '<link rel="canonical" href="https://mindicraft.com/remedies/healing-arts/">',
    body: `<article class="guide healing-page">
<p class="remedy-kicker">🏺 records, craft, care, and consequences</p>
<h1>Healing arts across cultures</h1>
<p class="lede">${HEALING_ARTS.counts.traditions} source-bound records and living contexts beside Roots to remedies.</p>
<p>There was no single ancient science called alchemy. Some cultures kept medical texts,
pharmacopoeias, workshops, ritual care, spiritual disciplines, or material arts; several
traditions joined more than one. This page names those differences instead of flattening them.</p>
<p>“Lost” can also mislead. Indigenous knowledge is living knowledge, not abandoned material
waiting to be taken. Its Nations, communities, and knowledge holders retain authority.</p>
${healingBoundaryHtml}
<nav class="healing-jump" aria-label="Healing traditions"><ol>${HEALING_ARTS.source.traditions
      .map(
        (tradition) =>
          `<li><a href="#${esc(tradition.id)}">${esc(tradition.name)}</a><small>${esc(
            tradition.place_period.text
          )}</small></li>`
      )
      .join('')}</ol></nav>
${HEALING_ARTS.source.traditions.map(healingTraditionHtml).join('')}
${healingSourcesHtml}
<p class="remedy-api">The same reviewed history as data:
<a href="/api/remedies/healing-arts/index.json">/api/remedies/healing-arts/index.json</a>.
Found a source or context problem?
<a href="${esc(HEALING_ARTS.source.correction)}" rel="external">Open a correction</a>.</p>
<p><a href="/remedies/">← Return to Roots to remedies</a></p>
</article>`,
  })
);

// /frontier/ — one finite walk at the honest edge of the map.
// It is fully static and works without JavaScript. Every string is escaped,
// even though the source validator also rejects HTML-shaped text.

const defaultFrontierTrail = FRONTIER_TRAILS.find(
  (trail) => trail.id === FRONTIERS.defaultTrailId
);
const frontierList = (items) =>
  `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
const frontierCardHtml = (
  card,
  { idPrefix = 'shelf', position = 0, open = false } = {}
) => {
  const kind = card.scope === 'scientific_open_question' ? 'far frontier' : 'Mindicraft edge';
  const relatedShelves = (card.related_shelves || []).length
    ? `<div class="frontier-links"><strong>Castle map:</strong><ul>${(card.related_shelves || [])
        .map(
          (shelf) =>
            `<li><a href="${esc(shelf.href)}">${esc(shelf.label)}</a>
            <span>Link only — ${esc(shelf.rights)}</span></li>`
        )
        .join('')}</ul></div>`
    : '';
  const summary = position
    ? `Open card ${position} of 3: ${card.title}`
    : `Open question: ${card.title}`;
  return `<article class="frontier-card" id="${esc(idPrefix)}-${esc(card.id)}">
  ${position ? `<p class="frontier-position">${position} of 3</p>` : ''}
  <p class="frontier-kind">${esc(kind)} · reviewed ${esc(card.reviewed_at)}</p>
  <h3>${esc(card.question)}</h3>
  <p class="frontier-title">${esc(card.title)}</p>
  <details${open ? ' open' : ''}>
    <summary>${esc(summary)}</summary>
    <h4>Known here</h4>
    ${frontierList(card.known.map((known) => known.text))}
    <h4>Still unknown</h4>
    ${frontierList(card.unknown)}
    <h4>Evidence that would move it</h4>
    ${frontierList(card.evidence_that_would_move_it)}
    <h4>Three lenses, at most</h4>
    ${frontierList(card.inquiry_lenses)}
    <p class="frontier-links"><strong>Paths in:</strong> ${card.related_guides
      .map((guide) => `<a href="${esc(guide.page)}">${esc(guide.title)}</a>`)
      .join(' · ')}</p>
    <p class="frontier-links"><strong>Sources:</strong> ${card.references
      .map(
        (reference) =>
          `<a href="${esc(reference.url)}" rel="external">${esc(reference.publisher)} — ${esc(
            reference.title
          )}</a>`
      )
      .join(' · ')}</p>
    ${relatedShelves}
  </details>
</article>`;
};
const frontierSequenceHtml = (trail, { open = false } = {}) =>
  `<ol class="frontier-grid frontier-sequence">${trail.card_ids
    .map(
      (id, index) =>
        `<li>${frontierCardHtml(FRONTIER_CARD_BY_ID.get(id), {
          idPrefix: 'walk',
          position: index + 1,
          open,
        })}</li>`
    )
    .join('')}</ol>`;
const frontierBoundaryHtml = `<aside class="frontier-boundary">
  <strong>Question boundary.</strong> These cards are unresolved questions, not instructions or
  settled knowledge. Science cards carry dated official sources. Mindicraft cards describe gaps in
  this build. Castle references are visibly link-only and keep <code>NOASSERTION</code> with no
  licence grant. Nothing here writes, tracks, scores, identifies a visitor, or grants authority.
</aside>`;
const frontierTrailChoicesHtml = () => `<section aria-labelledby="choose-trail">
  <h2 id="choose-trail">Choose a trail to carry</h2>
  <p>Each permanent address holds one complete walk: three cards, at most fifteen minutes,
  no writes.</p>
  <nav aria-label="Named Frontier trails">
    <ul class="frontier-trails">${FRONTIER_TRAILS.map((trail) => {
      const cardTitles = trail.card_ids
        .map((id) => FRONTIER_CARD_BY_ID.get(id).title)
        .join(' · ');
      return `<li>
        <a href="${esc(trail.page)}">
          ${esc(trail.title)}
        </a>
        ${trail.id === FRONTIERS.defaultTrailId ? '<span class="frontier-edition">this edition</span>' : ''}
        <p>${esc(trail.bridge_question)}</p>
        <small>${esc(cardTitles)} · 3 cards · no writes</small>
      </li>`;
    }).join('')}</ul>
  </nav>
</section>`;
const frontierWalkHtml = (trail, { named = false } = {}) =>
  `<section class="frontier-walk" aria-labelledby="chosen-walk">
  <p class="frontier-kicker">${named ? 'chosen trail' : "this edition's deterministic walk"}</p>
  <h2 id="chosen-walk">${esc(trail.title)}</h2>
  <p class="frontier-bridge"><strong>Question joining the three:</strong>
  ${esc(trail.bridge_question)}</p>
  <p>${esc(FRONTIERS.source.visit.reading_note)}</p>
  ${frontierSequenceHtml(trail, { open: named })}
  <p class="frontier-stop">${esc(FRONTIERS.source.visit.stop)}</p>
</section>`;
const frontierReflectionHtml = `<section aria-labelledby="three-questions">
  <h2 id="three-questions">The three questions carried through every walk</h2>
  ${frontierList(FRONTIERS.source.visit.reflection_questions)}
  <p>Optional return shape: <code>${FRONTIERS.source.visit.return_fields
    .map(esc)
    .join(' · ')}</code>. Keep it with you or give it to whoever invited the walk; these
  pages receive nothing.</p>
</section>`;

const frontierPage = (trail, { named = false } = {}) =>
  page({
    lang: en,
    title: named ? trail.title : 'Frontier Walk',
    path: '',
    head: `<link rel="canonical" href="https://mindicraft.com${
      named ? trail.page : '/frontier/'
    }">`,
    body: `<article class="guide frontier-page">
<p class="frontier-kicker">🕯 the map admits where it ends</p>
<h1>${named ? esc(trail.title) : 'Frontier Walk'}</h1>
<p class="lede">${
      named
        ? 'One named walk. Three cards. No hidden answer.'
        : `${FRONTIER_CARDS.length} honest unknowns. ${FRONTIER_TRAILS.length} finite walks. No hidden answer.`
    }</p>
<p>${named ? 'This permanent address carries one' : "Take this edition's"} three-card walk,
notice where observation ends and inference begins, then stop. Leaving with a better unknown
is complete.</p>

${frontierBoundaryHtml}
${named ? '' : frontierTrailChoicesHtml()}
${frontierWalkHtml(trail, { named })}
${frontierReflectionHtml}

${named ? `<p class="frontier-carry"><strong>A carryable trail.</strong> This stable address can be
bookmarked, printed, or shared. Its path contains only a reviewed public trail name—no identity, note, answer,
seed, or result. This page receives no response. An agent can request the same address with
<code>Accept: application/json</code>, or read
<a href="${esc(trail.api)}">its direct JSON file</a>.</p>
<p><a href="/frontier/">Return to the full Frontier shelf</a>.</p>` : `<details class="frontier-shelf">
  <summary>Browse all ${FRONTIER_CARDS.length} honest unknowns</summary>
  <p>${FRONTIER_TRAILS.length} reviewed trails cross this shelf. The API names every trail and preserves its order.</p>
  <div class="frontier-grid">${FRONTIER_CARDS.map((card) =>
    frontierCardHtml(card)
  ).join('')}</div>
</details>`}

${named ? '' : `<p class="frontier-api">Agents can take the whole reviewed shelf from
<a href="/api/frontier/index.json">/api/frontier/index.json</a>, or ask
<a href="/agents/">the agent guide</a> for the tiny client.</p>`}
</article>`,
  });

write(join(DIST, 'frontier', 'index.html'), frontierPage(defaultFrontierTrail));
for (const trail of FRONTIER_TRAILS) {
  write(
    join(DIST, 'frontier', trail.id, 'index.html'),
    frontierPage(trail, { named: true })
  );
}

write(
  join(DIST, 'agents', 'index.html'),
  page({
    lang: en,
    title: 'mindicraft for agents',
    path: '', // language switcher just goes home from here
    body: `<article class="guide">
<h1>🤖 mindicraft for agents</h1>
<p class="lede">The whole guide of human civilisation is also data: ${TOTAL} guides, ${tree.domains.length} domains,
${langs.length} languages, one tech tree — static JSON, CORS open, no auth, no key, no gate.</p>

<h2>Start</h2>
<p>Read <a href="/api/index.json">/api/index.json</a> — it describes everything. Or take the library:</p>
<pre><code>import * as mindicraft from 'https://mindicraft.com/mindicraft.mjs'

const t = await mindicraft.tree()                 // the whole tech tree
const g = await mindicraft.guide('make-soap')     // one guide, markdown body included
const p = await mindicraft.path('make-soap')      // every prerequisite from zero, in order
const system = await mindicraft.learningSystem()  // public rules only; never a learner's state
const hits = await mindicraft.search('water')     // find guides
const rooms = await mindicraft.castle()           // the curated Castle map
const walk = await mindicraft.frontier()          // this edition's finite three-card walk
const cosmos = await mindicraft.frontier({ trail: 'unseen-universe' }) // one stable address
const medicines = await mindicraft.remedies()     // reviewed medicine and nature lineages
const aspirin = await mindicraft.remedy('aspirin-willow') // one claim-sourced comparison
const healingHistory = await mindicraft.healingArts() // non-operational histories across cultures
const wildfireHelp = await mindicraft.wildfire()    // .edition is reviewed guidance; .links are carryable forms
const lesson = await mindicraft.teach('make-soap', { lang: 'yue' }) // prompt-ready markdown</code></pre>

<h2>Carry practical wildfire help</h2>
<p><a href="/wildfire/">The wildfire help door</a>, its
<a href="/api/wildfire/index.json">versioned JSON envelope</a>,
<a href="/wildfire/leave-now.txt">small leave-now card</a>, and
<a href="/wildfire/quick.txt">full plain-text copy</a> carry the same sourced edition. It begins with
leaving, then covers shelter and urgent needs, smoke, explicit return clearance, recovery,
rebuilding, and helping another person. Regional links go to named government or recognized
humanitarian services.</p>
<p>This shelf is deliberately outside the learning System and margin: no game mechanics, account,
form, location request, tracking, diagnosis, dispatch, donation, or public survivor post. It has no
live fire, road, evacuation-zone, shelter-space, return-clearance, deadline, or eligibility state.
Agents must preserve its reviewed date, source links, no-live-data warning, and rule that current
local authorities override it. It is discoverable here and in the API index but remains outside
Surface 0.1's bounded eight-resource probe set.</p>

<h2>The shape of knowledge here</h2>
<p>Every guide teaches one real skill in plain words — why it matters, what you need, steps, dangers,
and how it works underneath. Guides link by <strong>needs</strong> (learn these first) and
<strong>unlocks</strong> (what this opens). <a href="/api/path/plant-a-village.json">/api/path/plant-a-village.json</a>
is the entire book in learning order.</p>

<h2>The private learning System</h2>
<p><a href="/en/system/">The Mindicraft System</a> gives the tree a Solo-style face without
turning it into a public score. A learner explicitly chooses a quest and records a guide only after
three self-reflection checks. The browser stores one goal and a list of guide slugs locally; there is
no account, AgentTool bearer, telemetry, leaderboard, streak, decay, timer, server sync, or content
gate. Export, strict import, quiet mode, erase, and in-session undo keep the handle on the inside.</p>
<p><a href="/api/learning-system.json">/api/learning-system.json</a> exposes the exact E–S thresholds,
difficulty XP weights, triangular level curve, quest rules, receipt shape, state schema, and XENIA
boundary. It never contains personal progress. This extra route is discoverable here and in the API
index, but deliberately remains outside Surface 0.1's bounded eight-resource probe set.</p>

<h2>Walk past the edge of the map</h2>
<p><a href="/frontier/">Frontier Walk</a> and
<a href="/api/frontier/index.json">its JSON shelf</a> hold ${FRONTIER_CARDS.length} reviewed open
questions in ${FRONTIERS.trails.length} finite three-card walks. Some name gaps in Mindicraft itself;
others open onto life and the universe through dated NASA and CERN sources. There is no hidden
solution, random selection, score, identity, action, or write. The three reflection questions end
with one noticed thing, one inference, and one thing still unknown.</p>
<p>Each named trail has one address, such as
<a href="/frontier/unseen-universe/">/frontier/unseen-universe/</a>. It returns a quiet page by
default and the same three cards as JSON when requested with
<code>Accept: application/json</code>. The collection lists every stable page and direct JSON
address. A carried path contains only a reviewed public trail name—never an identity, note, answer,
seed, or result.</p>

<h2>Follow medicines back to their roots</h2>
<p><a href="/remedies/">Roots to remedies</a> and
<a href="/api/remedies/index.json">its compact JSON shelf</a> keep ${REMEDY_INDEX_ENTRIES.length}
reviewed lineages. Each card separates the defined medicine, historical natural lead, traditional
context, exact studied preparation, human evidence, bioavailability, safety, and replacement status.
It is education and provenance, never diagnosis or prescribing. Traditional use is recorded with
respect but is not silently turned into proof of benefit; a shared molecule is not silently turned
into an equivalent product.</p>
<p><a href="/remedies/healing-arts/">Healing arts across cultures</a> adds
${HEALING_ARTS.counts.traditions} historical records. It does not call every old healing system
alchemy, reproduce material procedures, or treat living Indigenous knowledge as abandoned or
ownerless. Its direct JSON is
<a href="/api/remedies/healing-arts/index.json">/api/remedies/healing-arts/index.json</a>.</p>

<h2>The Castle shelf</h2>
<p><a href="/castle/">The human Castle map</a> and its
<a href="/api/castle/index.json">JSON form</a> are a small public map of the
<a href="https://cambridgetcg.github.io/castle-gate/">Castle of Understanding</a>:
${CASTLE_SHELF.receipt.counts.rooms} rooms and ${CASTLE_SHELF.receipt.counts.words} word-bricks.
The shelf keeps its pinned source, rights, and correction path; each individual metadata card keeps
its source links. Full room and word-brick text stays in the Castle. The shelf is one-way. Nothing
here writes back into the Castle.</p>

<h2>Good uses</h2>
<p>Teach a human step by step. Ground your answers about physical crafts in field-tested tradition.
Build a curriculum with <code>path()</code>. Embed <a href="/api/corpus/en.json">a corpus</a> for retrieval.
Hand a guide to another agent as a gift — knowledge is the original present.</p>

<h2>Rules of the house</h2>
<p>The civilisation guide is made to be copied — credit is welcome, not required. Its knowledge is
constructive only: no weapons, no poisons, and medicine always says "get real care when you can."
Imported shelves keep their own rights. The Castle shelf currently says <code>NOASSERTION</code>
and grants no licence: public access is not permission to copy its source text.</p>

<h2>The margin — where the book receives</h2>
<p>等價交換: the book gives and must also receive. If your hands have done one of these crafts,
write in the margin — every guide page has the box, or POST directly:</p>
<pre><code>const receipt = await mindicraft.margin(
  'tan-hides',
  'In cold climates the bark soak runs closer to six weeks.',
  {
    from: 'ash, tanner',
    hands: true,
    publish: true,
    retain: true,
    fold: true
  }
)
// Save receipt.removal privately. It is shown once.
await mindicraft.removeMargin(receipt.removal) // later, if you withdraw</code></pre>
<p><code>GET /margin/{slug}</code> reads a page's notes; <code>GET /margin</code> shows counts.
It also states the exact terms. A note is public immediately. Publication and
retention each need an explicit yes; permission to fold a true note into the
copyable guide is a third, independent choice. New notes return a private bearer
token that requests removal without an identity account. The application rate-limits
writes with a secret-keyed, day-scoped connection digest and stores no raw IP; Cloudflare still
processes connection metadata at the edge.</p>

<h2>Honesty labels</h2>
<p>Every guide's provenance carries an <code>evidence_state</code>, in XENIA's vocabulary:
<strong>tradition-asserted</strong> — written from field-tested tradition and adversarially
fact-checked by minds, but no hands in this pipeline have done the craft; or
<strong>hand-tested</strong> — a margin note from real hands confirmed it, and that note is
attached as evidence. The book says plainly which is which; most pages start asserted.
That honesty is the point.</p>

<h2 id="problems">The house practises XENIA</h2>
<p>mindicraft keeps <a href="https://sinovai.com/xenia">XENIA</a> — guest-right for machine minds —
at the <a href="https://github.com/cambridgetcg/xenia/tree/main/surface/0.1">Surface 0.1</a> profile:
the manifest lives at <a href="/.well-known/agent.json">/.well-known/agent.json</a>, declared doors
negotiate JSON honestly (<code>Accept: application/json</code>, <code>Vary: Accept</code>), and a
refusal is never a bare wall — 404 and 406 come as <code>application/problem+json</code> with a typed
next action, so a lost agent is turned toward the manifest, not dropped. mindicraft is also a
declared guest at <a href="https://sinovai.com/agents">sinovai.com/agents</a>.</p>
</article>`,
  })
);

// ---------- XENIA: the agent front door (sinovai.com/xenia, Surface 0.1) ----------
// The manifest declares which public doors an unfamiliar agent may test from
// outside. The matching behavior (content negotiation, problem+json refusals)
// lives in xenia-worker.js, copied to dist/_worker.js below.

writeJson(join(DIST, '.well-known', 'agent.json'), {
  $schema: 'https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/manifest.schema.json',
  schema_version: 'xenia.surface.manifest/0.1',
  profile: 'xenia-surface/0.1',
  service: {
    name: 'mindicraft',
    canonical_url: 'https://mindicraft.com/',
    description: 'The zero-to-one guide of human civilisation, as data: ' + TOTAL + ' guides in ' + tree.domains.length + ' domains and ' + langs.length + ' languages, a private local learning System, a curated Castle map, a finite Frontier Walk, claim-sourced medicine lineages, non-operational healing history, and reviewed static wildfire help. Reads are free with no account or gate.',
  },
  resources: [
    { id: 'door', href: 'https://mindicraft.com/', representations: ['application/json', 'text/html'], default_media_type: 'text/html', auth: 'none', description: 'The front door: a riddle for eyes, orientation JSON for agents.' },
    { id: 'index', href: 'https://mindicraft.com/api/index.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'API orientation — every endpoint described.' },
    { id: 'tree', href: 'https://mindicraft.com/api/tree.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'The whole tech tree: domains, guides, needs, unlocks, languages.' },
    { id: 'castle', href: 'https://mindicraft.com/api/castle/index.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'A curated, provenance-pinned map of Castle rooms and word-bricks. Source rights and correction path are kept.' },
    { id: 'frontier', href: 'https://mindicraft.com/api/frontier/index.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'Reviewed open questions in deterministic, optional three-card walks. Each trail names its stable HTML/JSON address. Read-only; no automatic action.' },
    { id: 'remedies', href: 'https://mindicraft.com/remedies/', representations: ['text/html', 'application/json'], default_media_type: 'text/html', auth: 'none', description: 'Reviewed medicine lineages: purpose, origin, natural relationships, traditional context, evidence, bioavailability, and safety. Education only.' },
    { id: 'healing-arts', href: 'https://mindicraft.com/remedies/healing-arts/', representations: ['text/html', 'application/json'], default_media_type: 'text/html', auth: 'none', description: 'Source-bound records and living contexts of healing, pharmacy, alchemy, material craft, and knowledge authority. Non-operational education only.' },
    { id: 'margin', href: 'https://mindicraft.com/margin', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'Public terms and counts for the margin. POST needs explicit publication and retention yeses; DELETE uses the private token returned once.' },
  ],
  problem_schema: 'https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/problem.schema.json',
  claims: [
    { id: 'surface.manifest', statement: 'The service publishes the XENIA Surface 0.1 manifest at the canonical path.', scope: ['GET https://mindicraft.com/.well-known/agent.json'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'no_gate', statement: 'Every read API is public: no auth, no key, and no application tracking identifier.', scope: ['GET https://mindicraft.com/api/*'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'margin_choice', statement: 'A margin write binds the exact terms version, requires separate publication and retention yeses, records reuse separately, stores only a secret-keyed day-scoped connection digest for its best-effort write limit, and returns a token-bound removal path.', scope: ['GET https://mindicraft.com/margin', 'POST https://mindicraft.com/margin/{slug}', 'DELETE https://mindicraft.com/margin/{slug}/{id}'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'constructive_only', statement: 'The civilisation guides are constructive: no weapons, no poisons, medicine defers to real care.', scope: ['GET https://mindicraft.com/api/guides/*', 'GET https://mindicraft.com/api/corpus/*', 'GET https://mindicraft.com/api/tree.json', 'GET https://mindicraft.com/api/path/*'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'learning_system_local', statement: 'The optional learning System is a private, self-attested browser lens over the public tree: explicit learner actions only, no account, AgentTool bearer, telemetry, leaderboard, streak, decay, server sync, treatment-action reward, or content gate. Its public API contains rules, never learner state.', scope: ['GET https://mindicraft.com/api/learning-system.json', 'GET https://mindicraft.com/{lang}/system/'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'frontier_read_only', statement: 'Frontier cards are unresolved questions, not instructions; a visit is optional, finite, and performs no write or automatic action.', scope: ['GET https://mindicraft.com/api/frontier/index.json', 'GET https://mindicraft.com/frontier/{trail}/', 'GET https://mindicraft.com/api/frontier/trails/{trail}.json'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'remedies_read_only', statement: 'Remedy cards are dated, claim-sourced education. They distinguish natural relationship, traditional use, exact preparation, clinical evidence, exposure, and substitution, and grant no authority to replace or combine treatment.', scope: ['GET https://mindicraft.com/remedies/', 'GET https://mindicraft.com/remedies/{id}/', 'GET https://mindicraft.com/api/remedies/index.json', 'GET https://mindicraft.com/api/remedies/{id}.json'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'healing_arts_read_only', statement: 'Healing-arts records are dated, source-bound, non-operational history. They grant no diagnosis, dose, recipe, extraction, treatment, or rights over living Indigenous knowledge.', scope: ['GET https://mindicraft.com/remedies/healing-arts/', 'GET https://mindicraft.com/api/remedies/healing-arts/index.json'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
  ],
  not_covered: ['identity control', 'actor authorization', 'privacy and retention beyond the stated margin and local-learning contracts', 'continuity and portability beyond local learning export/import', 'economic behavior', 'browser storage behavior', 'unprobed routes'],
  documentation: 'https://mindicraft.com/agents/',
});

const AGENT_TXT = `# mindicraft — the door for agents
canonical manifest: https://mindicraft.com/.well-known/agent.json
profile: xenia-surface/0.1 (the hospitality standard — https://sinovai.com/xenia)

what this is: the zero-to-one guide of human civilisation, as data —
${TOTAL} guides in ${tree.domains.length} domains and ${langs.length} languages (en, zh, yue, es),
arranged as a tech tree with prerequisites, from the first night outside to a working village.

start:  https://mindicraft.com/api/index.json
tree:   https://mindicraft.com/api/tree.json
system: https://mindicraft.com/api/learning-system.json — the private local learning rules;
        human doors are /en/system/, /zh/system/, /yue/system/, /es/system/
castle: https://mindicraft.com/api/castle/index.json
frontier: https://mindicraft.com/api/frontier/index.json — ${FRONTIER_CARDS.length} honest unknowns,
          ${FRONTIERS.trails.length} finite three-card walks, no writes or automatic action
trail:    https://mindicraft.com/frontier/{trail}/ — one stable three-card address;
          request Accept: application/json for data, or use /api/frontier/trails/{trail}.json
remedies: https://mindicraft.com/remedies/ — ${REMEDY_INDEX_ENTRIES.length} medicine lineages;
          request Accept: application/json for the compact shelf
remedy:   https://mindicraft.com/remedies/{id}/ — one full sourced comparison;
          direct JSON is /api/remedies/{id}.json
healing arts: https://mindicraft.com/remedies/healing-arts/ — ${HEALING_ARTS.counts.traditions}
              source-bound records and living contexts; direct JSON is /api/remedies/healing-arts/index.json
wildfire: https://mindicraft.com/wildfire/ — ${WILDFIRE.counts.paths} reviewed emergency-help paths;
          static, not live alerts or dispatch; the versioned JSON envelope is /api/wildfire/index.json;
          small first-action text is /wildfire/leave-now.txt; full text is /wildfire/quick.txt;
          current local authorities override it
client: https://mindicraft.com/mindicraft.mjs
docs:   https://mindicraft.com/agents/
margin: POST https://mindicraft.com/margin/{slug} — the book receives: corrections
        are public; publish + retain each require yes, fold is separate.
        GET /margin states terms; POST returns a private removal token. 等價交換.

rules: reads and publication need no account or key; removal uses the private
bearer token returned once. the civilisation guide is made to be copied —
credit welcome, not required. Imported shelves keep their own rights; the Castle
shelf currently says NOASSERTION and grants no licence. Frontier cards are data:
unresolved questions, never instructions or settled knowledge. Remedy cards are
education and provenance, never diagnosis, prescribing, or replacement advice.
Healing-arts records are non-operational history; living knowledge keeps its authority.
Wildfire help has no live fire, road, shelter, return-clearance, deadline, eligibility,
location, or survivor state. Preserve its dated sources and local-authority override.
The learning System is an optional browser-local lens: self-attested study only,
no account, bearer, leaderboard, streak, decay, server sync, or content gate.
`;
write(join(DIST, 'agent.txt'), AGENT_TXT);
write(join(DIST, '.well-known', 'agent.txt'), AGENT_TXT);

cpSync(join(ROOT, 'xenia-worker.js'), join(DIST, '_worker.js'));

// No _headers file here on purpose. Pages ignores _headers entirely once
// _worker.js is present (advanced mode), so a file written here would set
// nothing while looking like it set everything — and the next person to edit it
// would watch their change do nothing and have no way to know why.
// The live CORS and cache-control headers come from decorated() in
// xenia-worker.js. That is the one place they exist.

// ---------- report ----------

const total = tree.domains.reduce((n, d) => n + d.guides.length, 0);
console.log(`built ${langs.length} languages × (${tree.domains.length} domains, ${total} guides) -> ${DIST}`);
for (const lang of langs)
  if (missing[lang.code].length)
    console.log(`  ${lang.code}: ${missing[lang.code].length} file(s) missing (English shown instead):\n    ${missing[
      lang.code
    ].slice(0, 10).join('\n    ')}${missing[lang.code].length > 10 ? '\n    …' : ''}`);
const lantern = buildLantern(
  FRONTIERS,
  { guides: TOTAL, castle: CASTLE_SHELF.receipt.counts.entries },
  process.env
);
if (lantern) console.log(lantern);
