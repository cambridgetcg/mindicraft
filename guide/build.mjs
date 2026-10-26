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
import { prepareCognition } from './cognition.mjs';
import { countItems, numberSteps, splitFieldCard } from './field-card.mjs';
import { assertCognitionReview } from './cognition-review.mjs';
import { buildLantern, prepareFrontiers } from './frontiers.mjs';
import { prepareHealingArts } from './healing-arts.mjs';
import { LEARNING_SYSTEM, createLearningEngine } from './learning-system.mjs';
import { assertMedicalReview } from './medical-review.mjs';
import { PATTERN_CARE_GUIDES, preparePatterns } from './patterns.mjs';
import { prepareRemedies } from './remedies.mjs';
import { prepareSeason, seasonWords } from './season.mjs';
import { prepareWildfireHelp } from './wildfire.mjs';
import { assertWildfireReview } from './wildfire-review.mjs';
import { MARGIN_TERMS } from './xenia-worker.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const MINDICRAFT_ROOT = dirname(ROOT);
const MINDICRAFT_INDEX = join(MINDICRAFT_ROOT, 'index');
const BUILD_DATE = new Date().toISOString().slice(0, 10);

const TREE_BYTES = readFileSync(join(ROOT, 'tree.json'));
const COGNITION_SOURCE_BYTES = readFileSync(join(ROOT, 'cognition.json'));
const PATTERN_DEFINITION_BYTES = readFileSync(join(ROOT, 'patterns.mjs'));
const FRONTIER_SOURCE_BYTES = readFileSync(join(ROOT, 'frontiers.json'));
const HEALING_ARTS_SOURCE_BYTES = readFileSync(join(ROOT, 'healing-arts.json'));
const REMEDY_SOURCE_BYTES = readFileSync(join(ROOT, 'remedies.json'));
const WILDFIRE_SOURCE_BYTES = readFileSync(join(ROOT, 'wildfire.json'));
const COGNITION_REVIEW_RECEIPT = JSON.parse(
  readFileSync(join(ROOT, 'cognition-review.json'), 'utf8')
);
assertCognitionReview(COGNITION_REVIEW_RECEIPT, COGNITION_SOURCE_BYTES);
const COGNITION_MAP = prepareCognition(
  JSON.parse(COGNITION_SOURCE_BYTES.toString('utf8')),
  { sourceBytes: COGNITION_SOURCE_BYTES }
);
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
const PATTERN_CARE_SOURCE_BYTES = Object.fromEntries(
  PATTERN_CARE_GUIDES.map((slug) => [
    slug,
    readFileSync(join(ROOT, 'content', 'en', 'living-together', `${slug}.md`)),
  ])
);
const PATTERNS = preparePatterns(tree, {
  sourceBytes: TREE_BYTES,
  careSourceBytes: PATTERN_CARE_SOURCE_BYTES,
  definitionBytes: PATTERN_DEFINITION_BYTES,
});
const langs = JSON.parse(readFileSync(join(ROOT, 'langs.json'), 'utf8')).languages;
const ENGLISH = langs.find((l) => l.code === 'en');
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
const SEASON = prepareSeason(
  JSON.parse(readFileSync(join(ROOT, 'season.json'), 'utf8')),
  { slugs: new Set(bySlug.keys()), languages: langs.map((l) => l.code), today: BUILD_DATE }
);
if (!SEASON.current) {
  console.log(`season: ${SEASON.id} passed its check date (${SEASON.check_by}) and is left off every page until it is checked against a newer forecast`);
}

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

// html[data-theme] is set only when a reader chose; absent, the system decides.
const THEME_KEY = 'mindicraft-theme';
const THEME_HEAD = `try{const t=localStorage.getItem('${THEME_KEY}');if(t==='night'||t==='day')document.documentElement.dataset.theme=t}catch{}`;
const THEME_CLIENT = `(() => {
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return;
  const root = document.documentElement;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const night = () => (root.dataset.theme ? root.dataset.theme === 'night' : dark.matches);
  const show = () => button.setAttribute('aria-pressed', String(night()));
  button.addEventListener('click', () => {
    root.dataset.theme = night() ? 'day' : 'night';
    try { localStorage.setItem('${THEME_KEY}', root.dataset.theme); } catch {}
    show();
  });
  button.hidden = false;
  show();
  if (dark.addEventListener) dark.addEventListener('change', show);
  else if (dark.addListener) dark.addListener(show);
})();`;

function page({
  lang,
  title,
  path,
  body,
  head = '',
  learning = null,
  description = null,
  showLanguageSwitch = true,
  bodyClass = '',
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
  // Night reading by hand, on the pages that already run script. The stored
  // choice is applied in <head> so the page never flashes the wrong colours;
  // without script the button stays hidden and the system setting decides.
  const themeHead = learning ? `<script>${THEME_HEAD}</script>` : '';
  const themeToggle = learning
    ? `<button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" title="${esc(
        S.theme.hint
      )}" hidden><span aria-hidden="true">☾</span> ${esc(S.theme.night)}</button>`
    : '';
  const themeClient = learning ? `<script>${THEME_CLIENT}</script>` : '';
  return `<!doctype html>
<html lang="${lang.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(S.siteTitle)}</title>
<meta name="description" content="${esc(description || S.tagline)}">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>">
${themeHead}${head}
</head>
<body${bodyClass ? ` class="${esc(bodyClass)}"` : ''}${learningAttrs}>
<header class="top">
  <a class="brand" href="/${lang.code}/">${esc(S.siteTitle)}</a>
  <div class="top-actions">${showLanguageSwitch ? langSwitch(lang.code, path) : ''}${themeToggle}${learningDoor}</div>
</header>
<main>
${body}
</main>
<footer class="foot">${esc(S.footer)}</footer>
${themeClient}${learningClient}
</body>
</html>`;
}

const diffChip = (S, d) =>
  d ? `<span class="chip diff-${esc(d)}">${esc(S.difficultyWords[d] || d)}</span>` : '';

// ---------- field cards ----------
// The guide body cut (never edited) into a card to work from and its back;
// see field-card.mjs. bodyLang is the language the body is written in, which
// is English when English stands in for a missing translation.
const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (all, key) => (Object.hasOwn(values, key) ? String(values[key]) : all));

// Guides whose step headlines, read alone, are a list of what to eat from the
// wild; only the full steps narrow it to the safe kinds. Their glance shows
// no headlines until the headlines carry those limits themselves.
const GLANCE_WITHOUT_LEADS = new Set(['easy-wild-foods', 'small-sure-protein']);

function fieldCardHtml(lang, bodyLang, doc, path, slug) {
  const S = lang.strings;
  const F = S.fieldCard;
  const card = splitFieldCard(doc.body, bodyLang.strings.fieldCard.headings);
  if (!card) return marked.parse(doc.body);

  const of = (kind) => card.front.find((s) => s.kind === kind).markdown;
  const steps = numberSteps(marked.parse(of('steps')));
  const section = ({ kind, markdown }) => {
    const html = kind === 'steps' ? steps.html : marked.parse(markdown);
    return kind
      ? `<section class="card-section card-${kind}" id="${kind}">\n${html}</section>`
      : `<section class="card-section">\n${html}</section>`;
  };
  // The edition names the reviewed words themselves, so paper and page can be
  // compared: the same code means the same guide.
  const edition = createHash('sha256').update(doc.body).digest('hex').slice(0, 8);
  const evidenceWords = evidenceOf(slug) === 'hand-tested' ? S.evidenceTested : S.evidenceAsserted;
  return `<p class="card-colophon">${esc(
    fill(F.colophon, { url: `mindicraft.com/${lang.code}/${path}`, language: lang.name, edition, evidence: evidenceWords })
  )}<span class="card-newer">${esc(F.checkNewer)}</span>${
    card.back.length
      ? `<span class="card-off">${esc(fill(F.offCard, { sections: card.back.map((s) => s.title).join(' · ') }))}</span>`
      : ''
  }</p>
<div class="field-card">
<nav class="card-glance" aria-labelledby="card-glance-title">
<p class="card-kicker" id="card-glance-title">${esc(F.kicker)} · ${esc(F.glance)}</p>
${
  steps.leads && !GLANCE_WITHOUT_LEADS.has(slug)
    ? `<ol class="card-leads">${steps.leads
        .map(({ html, whole }, i) => `<li><a href="#step-${i + 1}"${whole ? '' : ' class="cut"'}>${html}</a></li>`)
        .join('')}</ol>\n`
    : ''
}<p class="card-jumps"><a href="#need">${esc(fill(F.needCount, { n: countItems(of('need')) }))}</a> · <a href="#steps">${esc(
    fill(F.stepsCount, { n: steps.count })
  )}</a> · <a class="card-watch-jump" href="#watch">${esc(fill(F.watchCount, { n: countItems(of('watch')) }))}</a></p>
<button class="card-print" type="button" hidden>${esc(F.print)}</button>
</nav>
${marked.parse(card.intro)}${card.front.map(section).join('\n')}
</div>
${
  card.back.length
    ? `<div class="card-back">
<p class="card-kicker">${esc(F.back)}</p>
${card.back.map(section).join('\n')}
</div>\n`
    : ''
}<p class="card-edition">${esc(fill(F.edition, { edition }))}</p>
<script>
(function () {
  var button = document.querySelector('.card-print');
  if (!button || typeof window.print !== 'function') return;
  var root = document.documentElement;
  var cardOnly = false;
  var reset = function () {
    cardOnly = false;
    root.classList.remove('print-card');
  };
  button.hidden = false;
  button.addEventListener('click', function () {
    cardOnly = true;
    root.classList.add('print-card');
    window.print();
    // Not every browser sends afterprint; the next touch or key ends it too.
    setTimeout(function () {
      window.addEventListener('pointerdown', reset, { once: true });
      window.addEventListener('keydown', reset, { once: true });
    }, 0);
  });
  // Ctrl+P and the browser menu still print the whole guide.
  window.addEventListener('beforeprint', function () { root.classList.toggle('print-card', cardOnly); });
  window.addEventListener('afterprint', reset);
})();
</script>`;
}

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

// One line of the home contents: the guide's title, difficulty and time. The
// summary stays searchable and lives on the domain page's full card.
const tocRow = (lang, domain, guide) => {
  const S = lang.strings;
  const local = content[lang.code][guide.slug]?.meta || {};
  return `<li><a class="card" href="/${lang.code}/${domain.key}/${guide.slug}/" data-guide-card="${esc(
    guide.slug
  )}" data-domain-id="${esc(domain.key)}" data-difficulty="${esc(
    guide.difficulty
  )}" data-search="${esc(
    `${local.title || guide.title} ${local.summary || guide.summary}`.toLowerCase()
  )}">
  <strong>${esc(local.title || guide.title)}</strong>
  <span class="toc-meta"><i class="diff-${esc(guide.difficulty)}">${esc(
    S.difficultyWords[guide.difficulty] || guide.difficulty
  )}</i> · ${esc(local.time || guide.time || '')}</span>
</a></li>`;
};

// ---------- the season ahead ----------
// Rules and dates live in season.mjs; this only lays the leaf out.

const titleIn = (code, slug) =>
  content[code][slug]?.meta?.title || content.en[slug]?.meta?.title || bySlug.get(slug)?.guide.title || slug;
const seasonGuide = (code, slug) =>
  `<a href="/${code}/${bySlug.get(slug).domain.key}/${slug}/">${esc(titleIn(code, slug))}</a>`;

// A strip of the tropical Pacific: warm water spread east, the rain moving
// with it, the west left drier. A sketch of the mechanism, not a map.
const seasonSvg = (d, anomaly) => `<svg viewBox="0 0 440 212" role="img" aria-labelledby="season-svg-title season-svg-desc">
<title id="season-svg-title">${esc(d.title)}</title>
<desc id="season-svg-desc">${esc(d.desc)}</desc>
<defs>
<radialGradient id="sv-warm"><stop offset="0%" class="sv-warm-core"/><stop offset="100%" class="sv-warm-edge"/></radialGradient>
<clipPath id="sv-ocean"><rect x="52" y="108" width="336" height="62" rx="6"/></clipPath>
</defs>
<rect class="sv-sea" x="52" y="108" width="336" height="62" rx="6"/>
<g clip-path="url(#sv-ocean)"><ellipse cx="296" cy="139" rx="132" ry="40" fill="url(#sv-warm)"/></g>
<path class="sv-land" d="M4 102C20 94 40 98 52 108V170C38 180 18 178 4 170Z"/>
<path class="sv-land" d="M388 106C402 98 422 100 436 108V172C422 182 402 180 388 172Z"/>
<path class="sv-drift" d="M86 139H190"/><path class="sv-drift-head" d="M204 139 190 131.5V146.5Z"/>
<text class="sv-label" x="62" y="101">${esc(d.drift)}</text>
<text class="sv-hot" x="300" y="145" text-anchor="middle">+${esc(anomaly)}</text>
<g transform="translate(64 54)"><circle class="sv-sun" r="10"/><path class="sv-sun" d="M0-17v-6M0 17v6M-17 0h-6M17 0h6M-12-12-16-16M12 12 16 16M-12 12-16 16M12-12 16-16"/></g>
<text class="sv-label sv-strong" x="64" y="20" text-anchor="middle">${esc(d.dry)}</text>
<g transform="translate(290 52)"><g class="sv-cloud"><circle cx="-17" cy="2" r="12"/><circle cx="2" cy="-6" r="16"/><circle cx="20" cy="2" r="12"/><rect x="-29" y="0" width="61" height="14" rx="7"/></g><path class="sv-rain" d="M-18 21l-4 12M-4 21l-4 12M10 21l-4 12M24 21l-4 12"/></g>
<text class="sv-label sv-strong" x="290" y="20" text-anchor="middle">${esc(d.rain)}</text>
<text class="sv-label" x="4" y="202">${esc(d.west)}</text>
<text class="sv-label" x="436" y="202" text-anchor="end">${esc(d.east)}</text>
</svg>`;

function seasonHtml(lang) {
  if (!SEASON.current) return '';
  const { words: W, anomaly, month, published, nextUpdate, checkBy } = seasonWords(SEASON, lang.code);
  const code = lang.code;
  const cite = (sources) =>
    `<small>(${sources
      .map((source) => `<a href="${esc(source.url)}" rel="external">${esc(source.name)}</a>`)
      .join(' · ')})</small>`;
  const place = (p) => `<li><strong>${esc(p.place)}</strong><p>${esc(p.tends)} ${cite(p.sources)}</p>${
    p.guides.length
      ? `<span class="season-go">${esc(W.go)}${W.go.endsWith('：') ? '' : ' '}${p.guides
          .map((slug) => seasonGuide(code, slug))
          .join(' · ')}</span>`
      : ''
  }</li>`;
  const outlook = `<a href="${esc(SEASON.outlook.url)}" rel="external">${esc(SEASON.outlook.publisher)}</a>`;
  return `<section class="season" id="season" aria-labelledby="season-title" data-check-by="${esc(SEASON.check_by)}">
<p class="season-stale" role="note" hidden>${esc(fill(W.stale, { check_by: checkBy }))}</p>
<div class="season-body">
<div class="season-head">
<p class="season-kicker">${esc(W.kicker)}</p>
<h2 id="season-title">${esc(W.title)}</h2>
<p class="season-lede">${esc(W.lede)}</p>
<figure class="season-figure">${seasonSvg(W.diagram, anomaly)}
<figcaption>${esc(fill(W.diagram.caption, { anomaly, month }))}</figcaption></figure>
</div>
<div class="season-where">
<h3>${esc(W.where)}</h3>
<ul class="season-places">
${W.places.map(place).join('\n')}
</ul>
</div>
<div class="season-print">
<h3>${esc(W.print_title)}</h3>
<p>${esc(W.print_lede)}</p>
<ul>${SEASON.print.map((slug) => `<li>${seasonGuide(code, slug)}</li>`).join('')}</ul>
<p class="season-co"><strong>${esc(W.co_lead)}</strong> ${esc(W.co_text)} ${cite(SEASON.carbon_monoxide_sources)}</p>
</div>
</div>
<p class="season-source">${fill(esc(W.source_line), {
    outlook,
    published: esc(published),
    next_update: esc(nextUpdate),
    check_by: esc(checkBy),
  })}</p>
</section>
<script>(() => {
  const leaf = document.getElementById('season');
  if (!leaf || Date.now() <= Date.parse(leaf.dataset.checkBy + 'T23:59:59Z')) return;
  leaf.classList.add('is-stale');
  leaf.querySelector('.season-stale').hidden = false;
})();</script>`;
}

const craftLawHtml = (S) => `<aside class="craft-law" aria-labelledby="craft-law-title">
  <h2 id="craft-law-title">${esc(S.craftLaw.title)}</h2>
  <ol>
    <li><strong>${esc(S.craftLaw.materials)}</strong><span>${esc(
  S.craftLaw.materialsText
)}</span></li>
    <li><strong>${esc(S.craftLaw.conditions)}</strong><span>${esc(
  S.craftLaw.conditionsText
)}</span></li>
    <li><strong>${esc(S.craftLaw.process)}</strong><span>${esc(
  S.craftLaw.processText
)}</span></li>
    <li><strong>${esc(S.craftLaw.result)}</strong><span>${esc(
  S.craftLaw.resultText
)}</span></li>
  </ol>
</aside>`;

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
  <ol class="toc">${domain.guides.map((g) => tocRow(lang, domain, g)).join('\n')}</ol>
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
${seasonHtml(lang)}
<section class="hero book-hero">
  <p class="book-kicker">✦ ${esc(S.bookKicker)}</p>
  <h1>${esc(S.tagline)}</h1>
  <p class="hero-intro">${esc(S.hero)}</p>
  <p class="book-truth">${esc(S.bookTruth)}</p>
  <p class="hero-actions"><a class="book-button" href="/${lang.code}/begin/">${esc(
  S.startHere
)}</a></p>
  ${craftLawHtml(S)}
  <label class="search-label" for="q">${esc(S.searchLabel)}</label>
  <input id="q" type="search" placeholder="${esc(S.searchPlaceholder)}" autocomplete="off">
  <p id="noresults" role="status" aria-live="polite" hidden>${esc(S.noResults)}</p>
</section>
<div class="book-contents" id="contents">${domainsHtml}</div>
<nav class="home-shelves" aria-labelledby="home-shelves-title">
  <h2 id="home-shelves-title">${esc(S.moreShelves)}</h2>
  <div>
    <a class="patterns-home-door" href="/patterns/">
      <strong>How the pieces connect · English</strong>
      <span>The real guide graph, its village reading path, and five open care questions.</span>
    </a>
    <a class="patterns-home-door cognition-home-door" href="/cognition/">
      <strong>AI cognition map · English</strong>
      <span>Nine separate dimensions, dated observations, human comparisons with edges, and visible gaps.</span>
    </a>
  </div>
</nav>
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
${fieldCardHtml(lang, own ? lang : ENGLISH, doc, `${domain.key}/${guide.slug}/`, guide.slug)}
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
// A visible book cover. Wonder belongs in the craft; entry needs no riddle.
write(
  join(DIST, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mindicraft · a book of causes and craft</title>
<meta name="description" content="A plain, open book of practical causes and craft. Materials, conditions, and process lead to an expected result.">
<link rel="canonical" href="https://mindicraft.com/">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>">
</head>
<body class="root-page">
<header class="top root-top">
  <a class="brand" href="/">mindicraft</a>
  <a class="root-agent-door" href="/agents/">For agents</a>
</header>
<main class="root-main">
<a class="wildfire-entry" href="/wildfire/">
  <span><strong>Wildfire help</strong><span>Leave safely · find official help · return and rebuild</span></span>
</a>
${
  SEASON.current
    ? `<nav class="season-entry" aria-labelledby="season-entry-title">
  <p><strong id="season-entry-title">${esc(SEASON.languages.en.kicker)}: ${esc(
        SEASON.languages.en.title
      )}</strong><span>${esc(SEASON.languages.en.where)}, and the cards to print first. Forecast of ${esc(
        seasonWords(SEASON, 'en').published
      )}; it comes down after ${esc(seasonWords(SEASON, 'en').checkBy)}.</span></p>
  <p class="season-entry-langs">${langs
    .map((language) => `<a href="/${language.code}/#season" hreflang="${esc(language.code)}">${esc(language.name)}</a>`)
    .join('')}</p>
</nav>
`
    : ''
}<article class="root-cover" aria-labelledby="root-title">
  <p class="root-kicker">✦ a working book of causes and craft</p>
  <h1 id="root-title">mindicraft</h1>
  <p class="root-lede"><em>It may look like a spellbook. It works like a workshop.</em></p>
  <p>The practical chapters do not ask you to trust magic. Materials, conditions,
  and process lead to an expected result. Each chapter shows what you need, what
  to do, what can fail, and why the process should work.</p>
  <section class="root-open" aria-labelledby="open-book">
    <h2 id="open-book">Open the book</h2>
    <nav class="root-languages" aria-label="Choose a language">
      ${langs
        .map(
          (language) => `<a href="/${language.code}/"><strong>${esc(
            language.name
          )}</strong><span>${esc(language.strings.tagline)}</span></a>`
        )
        .join('\n      ')}
    </nav>
    <p class="root-actions">
      <a class="book-button" href="/en/begin/">Start with the basics</a>
      <a href="/en/#q">Find a craft</a>
    </p>
  </section>
  <p class="root-equation" aria-label="Materials plus conditions plus process lead to an expected result">
    <span>materials</span><b aria-hidden="true">+</b><span>conditions</span><b aria-hidden="true">+</b>
    <span>process</span><b aria-hidden="true">→</b><span>expected result</span>
  </p>
  <p class="root-reality"><strong>The page holds an expectation. Reality returns the result.</strong>
  Keep them separate.</p>
  <p class="root-equation root-return" aria-label="Try, observe, compare, then learn, repair, or rest">
    <span>try</span><b aria-hidden="true">→</b><span>observe</span><b aria-hidden="true">→</b>
    <span>compare</span><b aria-hidden="true">→</b><span>learn · repair · rest</span>
  </p>
</article>
<nav class="root-shelves" aria-labelledby="other-shelves">
  <h2 id="other-shelves">Other shelves</h2>
  <div>
    <a href="/remedies/"><strong>Roots to remedies</strong><span>Medicines, their links to nature, evidence, exposure, and risk</span></a>
    <a href="/remedies/healing-arts/"><strong>Healing histories</strong><span>Source-bound records across cultures, kept non-operational</span></a>
    <a href="/frontier/"><strong>Open questions</strong><span>Three-card walks at the honest edge of the map</span></a>
    <a href="/cognition/"><strong>AI cognition map</strong><span>Dated capability evidence across nine separate dimensions, never one intelligence score</span></a>
    <a href="/castle/"><strong>Castle map</strong><span>A provenance-pinned map of rooms and words</span></a>
    <a href="/patterns/"><strong>How the pieces connect</strong><span>The real guide graph, a reading path to its village chapter, and five open care questions</span></a>
  </div>
</nav>
</main>
<footer class="foot">Plain words. Free to read. No account, no hidden entrance, no gate.</footer>
</body>
</html>`
);

write(
  join(DIST, '404.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found · mindicraft</title><link rel="stylesheet" href="/style.css"></head>
<body class="root-page"><header class="top root-top"><a class="brand" href="/">mindicraft</a></header>
<main class="root-main not-found"><p class="root-kicker">page not found</p>
<h1>That page is not in the book.</h1>
<p>The address may have changed, or this chapter may not exist yet.</p>
<nav aria-label="Useful doors"><a class="book-button" href="/">Return to the cover</a>
<a href="/wildfire/">Wildfire help</a><a href="/en/">The book</a>
<a href="/patterns/">How the pieces connect</a><a href="/remedies/">Remedies</a>
<a href="/frontier/">Open questions</a><a href="/cognition/">AI cognition map</a>
<a href="/agent.txt">Agent text</a></nav></main></body></html>`
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

// A reviewed, append-only cognition map. It is separate from the human craft
// tree and private learning System, and has no aggregate intelligence score.
writeJson(join(DIST, 'api', 'cognition', 'index.json'), COGNITION_MAP);

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

// A derived human-scale reading of that same tree. It introduces no guide,
// progress record, or authority: /api/tree.json remains the complete graph.
writeJson(join(DIST, 'api', 'patterns.json'), PATTERNS);

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
    cognition_dimensions: COGNITION_MAP.counts.dimensions,
    cognition_observations: COGNITION_MAP.counts.observations,
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
    patterns: `/api/patterns.json — a derived ${PATTERNS.counts.domains}-domain view, its ${PATTERNS.counts.backbone_domain_edges}-link readable backbone, the ${PATTERNS.counts.village_path_guides}-guide reading path ending at Plant a village, and five care questions; never a score of a person or proof of understanding`,
    cognition: `/api/cognition/index.json — ${COGNITION_MAP.counts.observations} reviewed, dated task observations across ${COGNITION_MAP.counts.dimensions} separate AI cognition dimensions; human comparisons stay bound to the named task and cohort, never one intelligence score`,
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
    'Read-only guide APIs need no auth or key and set no application tracking identifier. The optional learning System stores only an explicit goal and self-attested study marks in the learner browser; it has no account, telemetry, leaderboard, streak, decay, server sync, or content gate. The cognition map keeps task-bound dimensions separate and never computes an intelligence score, IQ, mental age, profession, consciousness claim, or whole-civilisation rank. Margin writes are limited to 20 per UTC day using a secret-keyed, day-scoped connection digest; the application stores no raw IP. The civilisation guide is made to be copied; imported shelves keep their own stated rights. Castle entries currently say NOASSERTION and grant no licence. Frontier cards are unresolved questions, never instructions or settled knowledge. Remedy cards are sourced education, not diagnosis, prescribing, or permission to replace or combine treatment. Healing-arts records are non-operational history and preserve living knowledge authority. Wildfire help is reviewed static emergency guidance, never live fire, road, shelter, return-clearance, dispatch, diagnosis, eligibility, or location data; current local authorities override it.',
  margin_terms: MARGIN_TERMS,
  humans: '/patterns/ (how the pieces connect), /cognition/ (reviewed AI cognition map, English), /wildfire/ (reviewed wildfire evacuation and recovery help, English), /en/ (English), /zh/ (中文), /yue/ (廣東話), /es/ (Español), /{lang}/system/ (private local learning path), /remedies/ (medicine lineages), /remedies/healing-arts/ (cross-cultural history)',
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
> AI cognition map keeps ${COGNITION_MAP.counts.observations} dated observations across ${COGNITION_MAP.counts.dimensions} separate dimensions. Human references are exact-task comparisons, never one intelligence score.
> The Castle shelf maps ${CASTLE_SHELF.receipt.counts.rooms} rooms and ${CASTLE_SHELF.receipt.counts.words} word-bricks without copying their bodies.
> Frontier Walk keeps ${FRONTIER_CARDS.length} reviewed unknowns in ${FRONTIERS.trails.length} finite walks. Three cards is complete; nothing is submitted.
> Roots to remedies keeps ${REMEDY_INDEX_ENTRIES.length} reviewed medicine lineages. Natural origin, traditional use, human evidence, bioavailability, and substitution are separate facts.
> Healing arts keeps ${HEALING_ARTS.counts.traditions} source-bound records and living contexts distinct. Alchemy is not a universal name for ancient medicine, and living knowledge remains under community authority.
> Wildfire help carries ${WILDFIRE.counts.paths} reviewed paths and ${WILDFIRE.counts.regions} official regional routers as HTML, JSON, and plain text. It is static, not a live alert or dispatch service; local authorities override it.

## API (static reads: CORS open, no auth; margin removal: bearer token)
- /api/index.json : start here — all endpoints described
- /api/tree.json : the whole tech tree (domains, guides, needs, unlocks, languages)
- /api/patterns.json : the same tree at domain scale, a reading path ending at Plant a village, five care questions, and explicit claim limits
- /api/cognition/index.json : reviewed AI capability observations, exact-task human references, visible gaps, append-only lineage, and no aggregate score
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
- /mindicraft.mjs : tiny ESM client (tree, patterns, cognition, guide, path, learningSystem, search, castle, frontiers, frontier, remedies, remedy, healingArts, wildfire, teach, margin, removeMargin)
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
export const patterns = () => get('/api/patterns.json');
export const cognition = () => get('/api/cognition/index.json');
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

// /cognition/ — a dated map of task-bound AI capability observations. The
// table is the visual map and its complete plain equivalent at once: no radar
// chart, weighted total, client script, learner state, or live leaderboard.
const cognitionDimensionById = new Map(
  COGNITION_MAP.dimensions.map((dimension) => [dimension.id, dimension])
);
const cognitionScopeById = new Map(
  COGNITION_MAP.scopes.map((scope) => [scope.id, scope])
);
const cognitionSourceById = new Map(
  COGNITION_MAP.sources.map((source) => [source.id, source])
);
const cognitionObservationById = new Map(
  COGNITION_MAP.observations.map((observation) => [observation.id, observation])
);
const cognitionGapByDimension = new Map(
  COGNITION_MAP.gaps.map((gap) => [gap.dimension_id, gap])
);

const cognitionCellHtml = (dimensionId, scopeId) => {
  const observations = COGNITION_MAP.observations.filter(
    (observation) =>
      observation.dimension_id === dimensionId && observation.scope_id === scopeId
  );
  if (!observations.length) {
    const gap = cognitionGapByDimension.get(dimensionId);
    const namedGap = gap?.scope_ids.includes(scopeId);
    return `<span class="cognition-empty">${namedGap ? 'Not measured in this edition' : 'No reviewed observation'}</span>`;
  }
  return `<ol class="cognition-cell-readings">${observations
    .map(
      (observation) => `<li><a href="#${esc(observation.id)}">${esc(
        observation.subject
      )}</a><span>${esc(observation.reported_at)} · ${esc(
        observation.human_reference.comparison
      )}</span></li>`
    )
    .join('')}</ol>`;
};

const cognitionMapRowsHtml = COGNITION_MAP.dimensions
  .map(
    (dimension) => `<tr>
  <th scope="row"><strong>${esc(dimension.label)}</strong><span>${esc(
      dimension.meaning
    )}</span></th>
  ${COGNITION_MAP.scopes
    .map(
      (scope) => `<td>${cognitionCellHtml(dimension.id, scope.id)}</td>`
    )
    .join('')}
</tr>`
  )
  .join('');

const cognitionObservationHtml = (observation) => {
  const dimension = cognitionDimensionById.get(observation.dimension_id);
  const scope = cognitionScopeById.get(observation.scope_id);
  const previous = observation.lineage.previous_id
    ? cognitionObservationById.get(observation.lineage.previous_id)
    : null;
  const sourceLinks = observation.source_ids
    .map((sourceId) => cognitionSourceById.get(sourceId))
    .map(
      (source) => `<a href="${esc(source.url)}" rel="external">${esc(
        source.title
      )}</a> <span>(${esc(source.publisher)}, ${esc(source.published_at)})</span>`
    )
    .join('<br>');
  return `<article class="cognition-observation" id="${esc(observation.id)}">
  <header>
    <p>${esc(observation.reported_at)} · ${esc(scope.label)} · ${esc(
      dimension.label
    )}</p>
    <h3>${esc(observation.subject)}</h3>
  </header>
  <p class="cognition-result">${esc(observation.result)}</p>
  <dl>
    <div><dt>Task</dt><dd><strong>${esc(observation.benchmark)}</strong><br>${esc(
      observation.task
    )}</dd></div>
    <div><dt>Human reference</dt><dd>${esc(
      observation.human_reference.comparison
    )}<small>${esc(observation.human_reference.cohort)}</small><small>${esc(
      observation.human_reference.boundary
    )}</small></dd></div>
    <div><dt>Exact setup</dt><dd>${esc(observation.setup)}</dd></div>
    <div><dt>Limits</dt><dd>${esc(observation.limits)}</dd></div>
    <div><dt>Source</dt><dd>${sourceLinks}</dd></div>
  </dl>
  ${
    previous
      ? `<p class="cognition-lineage">Recorded later in the same broad measurement family after <a href="#${esc(
          previous.id
        )}">${esc(previous.subject)} (${esc(previous.reported_at)})</a>. Read each card's setup and limits: the suite may have changed, and this sequence alone proves neither exact comparability nor cause.</p>`
      : '<p class="cognition-lineage">First observation in this recorded series.</p>'
  }
</article>`;
};

const cognitionGapHtml = COGNITION_MAP.gaps
  .map((gap) => {
    const dimension = cognitionDimensionById.get(gap.dimension_id);
    const scopeNames = gap.scope_ids
      .map((scopeId) => cognitionScopeById.get(scopeId).label)
      .join(' · ');
    return `<li id="${esc(gap.id)}"><strong>${esc(dimension.label)}</strong><span>${esc(
      scopeNames
    )}</span><p>${esc(gap.statement)}</p><p><em>Evidence needed:</em> ${esc(
      gap.evidence_needed
    )}</p></li>`;
  })
  .join('');

write(
  join(DIST, 'cognition', 'index.html'),
  page({
    lang: en,
    title: 'AI cognition map',
    path: '',
    showLanguageSwitch: false,
    bodyClass: 'cognition-body',
    description:
      'A reviewed, multidimensional map of dated AI capability observations and exact-task human comparisons, with no overall intelligence score.',
    head: `<link rel="canonical" href="https://mindicraft.com/cognition/">
<link rel="alternate" type="application/json" href="https://mindicraft.com/api/cognition/index.json">`,
    body: `<article class="cognition-page">
<header class="cognition-hero">
  <p class="cognition-kicker">AI civilisation · reviewed ${esc(
    COGNITION_MAP.reviewed_at
  )}</p>
  <h1>Many abilities. No single intelligence level.</h1>
  <p class="lede">This map follows public evidence of what named AI systems and agents did
  on named tasks. It keeps nine dimensions apart and gives every human comparison its edges.</p>
  <p class="cognition-language">This interpretive page is in English for now. The complete reviewed edition is also <a href="/api/cognition/index.json">plain JSON</a>.</p>
</header>

<aside class="cognition-truth" aria-labelledby="cognition-truth-title">
  <p class="cognition-kicker">what the map means</p>
  <h2 id="cognition-truth-title">Equivalent here means equivalent only here.</h2>
  <p>If a system overlaps a human percentile, medal threshold, accuracy, or task horizon,
  that relation belongs to the exact task, sampled people, conditions, and date. It does not
  turn into an IQ, mental age, profession, general human level, consciousness claim, or worth.</p>
  <p><strong>AI civilisation</strong> names this dated profile of many systems, agents, and gaps.
  The civilisation is not one being and receives no score.</p>
</aside>

<dl class="cognition-counts" aria-label="Edition counts">
  <div><dt>${COGNITION_MAP.counts.dimensions}</dt><dd>dimensions</dd></div>
  <div><dt>${COGNITION_MAP.counts.observations}</dt><dd>observations</dd></div>
  <div><dt>${COGNITION_MAP.counts.sources}</dt><dd>source records</dd></div>
  <div><dt>${COGNITION_MAP.counts.gaps}</dt><dd>gap records</dd></div>
</dl>

<section class="cognition-map" aria-labelledby="cognition-map-title">
  <p class="cognition-kicker">the map</p>
  <h2 id="cognition-map-title">Dimension × measured scope</h2>
  <p>A system is one named model or specialised solver under its stated setup. An agent adds a
  tool-using action loop. A collective has multiple cooperating AI participants. An empty cell
  means this edition has no reviewed observation there—not zero capability.</p>
  <div class="cognition-map-scroll" role="region" tabindex="0" aria-label="AI cognition dimension and scope map. Scroll horizontally on a narrow screen.">
    <table>
      <caption>All nine dimensions and all three scopes in this reviewed edition</caption>
      <thead><tr><th scope="col">Dimension</th>${COGNITION_MAP.scopes
        .map(
          (scope) => `<th scope="col"><strong>${esc(scope.label)}</strong><span>${esc(
            scope.meaning
          )}</span></th>`
        )
        .join('')}</tr></thead>
      <tbody>${cognitionMapRowsHtml}</tbody>
    </table>
  </div>
</section>

<section class="cognition-history" aria-labelledby="cognition-history-title">
  <p class="cognition-kicker">what was observed</p>
  <h2 id="cognition-history-title">Dated evidence, conditions attached</h2>
  <p>Cards stay in chronological append order. A lineage link means the records share a broad
  measurement family, not necessarily an identical suite; it does not by itself prove an upgrade
  or identify its cause.</p>
  <div class="cognition-observations">${COGNITION_MAP.observations
    .map(cognitionObservationHtml)
    .join('')}</div>
</section>

<section class="cognition-gaps" aria-labelledby="cognition-gaps-title">
  <p class="cognition-kicker">the blank parts matter</p>
  <h2 id="cognition-gaps-title">Known gaps in this edition</h2>
  <p>Not checked is not false, absent, refused, or incapable. These cards say what a later
  observation would need before it could honestly fill a cell.</p>
  <ol>${cognitionGapHtml}</ol>
</section>

<section class="cognition-contract" aria-labelledby="cognition-contract-title">
  <p class="cognition-kicker">the measuring rule</p>
  <h2 id="cognition-contract-title">No dimension pays for another</h2>
  <ul>${COGNITION_MAP.claim_limits
    .map((limit) => `<li>${esc(limit)}</li>`)
    .join('')}</ul>
  <p>The source file is manually reviewed and exact-byte pinned. This page performs no network
  fetch, write, tracking, scheduled update, automatic action, or learning-state read. Corrections
  belong at <a href="https://github.com/cambridgetcg/mindicraft/issues">the public issue door</a>.</p>
  <p><a href="/api/cognition/index.json">Read the complete map as JSON</a> · edition <code>${esc(
    COGNITION_MAP.edition_digest
  )}</code>.</p>
</section>
</article>`,
  })
);

// /patterns/ — one derived view over the real prerequisite graph. The large
// drawing is backed by the complete plain list below it and has no script,
// learner state, score, write door, or automatic action.
const PATTERN_MAP_WIDTH = 1240;
const PATTERN_NODE_WIDTH = 124;
const PATTERN_NODE_HEIGHT = 98;
const patternRanks = new Map();
for (const domain of PATTERNS.domains) {
  if (!patternRanks.has(domain.rank)) patternRanks.set(domain.rank, []);
  patternRanks.get(domain.rank).push(domain);
}
const patternMaxRows = Math.max(...[...patternRanks.values()].map(({ length }) => length));
const PATTERN_MAP_HEIGHT = Math.max(
  720,
  160 + (patternMaxRows - 1) * (PATTERN_NODE_HEIGHT + 32)
);
const patternMaxRank = Math.max(...patternRanks.keys());
const patternCenters = (count) => {
  if (count === 1) return [PATTERN_MAP_HEIGHT / 2];
  const available = PATTERN_MAP_HEIGHT - 160;
  const preferredSpacing = count === 2 ? 280 : 240;
  const spacing = Math.min(preferredSpacing, available / (count - 1));
  const first = PATTERN_MAP_HEIGHT / 2 - (spacing * (count - 1)) / 2;
  return Array.from({ length: count }, (_, index) => first + spacing * index);
};
const patternPositions = new Map();
for (const [rank, domains] of patternRanks) {
  const centers = patternCenters(domains.length);
  domains.forEach((domain, slot) => {
    patternPositions.set(domain.id, {
      left:
        24 +
        rank *
          ((PATTERN_MAP_WIDTH - 48 - PATTERN_NODE_WIDTH) / patternMaxRank),
      top: centers[slot] - PATTERN_NODE_HEIGHT / 2,
    });
  });
}

const patternEdgeKey = ({ from, to }) => `${from}>${to}`;
const patternBackboneKeys = new Set(
  PATTERNS.backbone_domain_edges.map(patternEdgeKey)
);
const patternVillageKeys = new Set(
  PATTERNS.village_path.domain_edges.map(patternEdgeKey)
);
const patternDiagramEdges = PATTERNS.cross_domain_edges
  .filter((edge) => patternBackboneKeys.has(patternEdgeKey(edge)) || patternVillageKeys.has(patternEdgeKey(edge)))
  .map((edge) => ({ ...edge, village: patternVillageKeys.has(patternEdgeKey(edge)) }))
  .sort((left, right) => Number(left.village) - Number(right.village));

const patternEdgeHtml = patternDiagramEdges
  .map((edge) => {
    const from = patternPositions.get(edge.from);
    const to = patternPositions.get(edge.to);
    const x1 = from.left + PATTERN_NODE_WIDTH;
    const y1 = from.top + PATTERN_NODE_HEIGHT / 2;
    const x2 = to.left;
    const y2 = to.top + PATTERN_NODE_HEIGHT / 2;
    const bend = Math.max(2, Math.min(72, (x2 - x1) * 0.42));
    return `<path class="pattern-edge${edge.village ? ' pattern-edge-village' : ''}"
      d="M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + bend).toFixed(1)} ${y1.toFixed(
      1
    )}, ${(x2 - bend).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}"
      marker-end="url(#${edge.village ? 'pattern-arrow-village' : 'pattern-arrow'})" />`;
  })
  .join('\n');

const patternNodeHtml = PATTERNS.domains
  .map((domain) => {
    const position = patternPositions.get(domain.id);
    return `<a class="pattern-domain${
      domain.village_path_guides ? ' is-village-path' : ''
    }" href="/en/${esc(domain.id)}/" style="left:${position.left.toFixed(
      1
    )}px;top:${position.top.toFixed(1)}px" aria-label="${esc(
      `${domain.title}: ${domain.guides} guides${
        domain.village_path_guides
          ? `, ${domain.village_path_guides} on the village reading path`
          : ''
      }`
    )}">
      <span class="pattern-domain-mark"><b>${domain.index}</b><span aria-hidden="true">${esc(
      domain.emoji
    )}</span></span>
      <strong>${esc(domain.title)}</strong>
      <small>${domain.guides} guides${
      domain.village_path_guides
        ? ` · ${domain.village_path_guides} in reading path`
        : ''
    }</small>
    </a>`;
  })
  .join('\n');

const patternDomainById = new Map(PATTERNS.domains.map((domain) => [domain.id, domain]));
const patternVillageEdgeCounts = new Map(
  PATTERNS.village_path.domain_edges.map((edge) => [patternEdgeKey(edge), edge.guide_edges])
);
const patternPlainEdge = (edge) => {
  const key = patternEdgeKey(edge);
  const labels = [];
  if (patternBackboneKeys.has(key)) labels.push('Readable backbone.');
  if (patternVillageKeys.has(key)) {
    const count = patternVillageEdgeCounts.get(key);
    labels.push(
      `Used by ${count} guide prerequisite${count === 1 ? '' : 's'} in the village reading path.`
    );
  }
  if (!labels.length) labels.push('Direct join left out of the reduced drawing.');
  return `<li><span aria-hidden="true">←</span> <a href="/en/${esc(
    edge.from
  )}/">${esc(patternDomainById.get(edge.from).title)}</a> — ${edge.guide_edges} direct guide
    prerequisite${edge.guide_edges === 1 ? '' : 's'}. <span>${labels.join(' ')}</span></li>`;
};
const patternPlainHtml = PATTERNS.domains
  .map((domain) => {
    const incoming = PATTERNS.cross_domain_edges.filter(({ to }) => to === domain.id);
    return `<li class="pattern-plain-domain"><a href="/en/${esc(
      domain.id
    )}/"><strong>${domain.index}. ${esc(
      domain.emoji
    )} ${esc(domain.title)}</strong></a>
      <span>${domain.guides} guides${
      domain.village_path_guides
        ? ` · ${domain.village_path_guides} in the village reading path`
        : ''
    }</span>
      ${
        incoming.length
          ? `<ul class="pattern-edge-list" aria-label="Direct prerequisites arriving from other domains">${incoming
              .map(patternPlainEdge)
              .join('')}</ul>`
          : '<span>No cross-domain prerequisite arrives here.</span>'
      }</li>`;
  })
  .join('\n');

const relationalReadingHtml = PATTERNS.care_questions
  .map((reading) => {
    const found = bySlug.get(reading.guide);
    if (!found) throw new Error(`patterns: missing care-question guide ${reading.guide}`);
    return `<li>
      <span class="pattern-shape" aria-hidden="true">${reading.shape}</span>
      <div><p>${esc(reading.name)}</p><h3><a href="/en/${esc(
      found.domain.key
    )}/${esc(reading.guide)}/">${esc(found.guide.title)}</a></h3>
      <span>${esc(reading.useful_structure)} <strong>Ask:</strong> ${esc(
      reading.question
    )}</span>
      <small><strong>Keep separate:</strong> ${esc(reading.keep_separate)}</small></div>
    </li>`;
  })
  .join('\n');

write(
  join(DIST, 'patterns', 'index.html'),
  page({
    lang: en,
    title: 'How the pieces connect',
    path: '',
    showLanguageSwitch: false,
    bodyClass: 'patterns-body',
    description:
      'The real Mindicraft prerequisite graph, the reading path ending at its village chapter, and five open questions for care.',
    head: `<link rel="canonical" href="https://mindicraft.com/patterns/">
<link rel="alternate" type="application/json" href="https://mindicraft.com/api/patterns.json">`,
    body: `<article class="patterns-page">
<p class="patterns-kicker">the real tree · two readings · no score of people</p>
<h1>How the pieces connect</h1>
<p class="lede">Understanding needs more than a pile of facts. One part is seeing how claims connect;
another is returning to reality and to other minds for comparison and correction.</p>
<p>Mindicraft stores one limited shape: ${PATTERNS.counts.guides} practical guides joined by
${PATTERNS.counts.prerequisite_edges} declared reading prerequisites. This page draws those same
committed links at domain scale. It adds no second guide graph and does not turn a reading path
into proof that the work will succeed.</p>
<p class="patterns-language">This interpretive page is in English for now. The book remains open in
<a href="/en/">English</a>, <a href="/zh/">中文</a>, <a href="/yue/">廣東話</a>, and <a href="/es/">Español</a>.</p>

<aside class="patterns-field" aria-labelledby="patterns-field-title">
  <p class="patterns-kicker">a test around every link</p>
  <h2 id="patterns-field-title">Love preserves standing. Understanding makes a return path.</h2>
  <p>Here that sentence is a design test, not a description of every guide. Ask whether anyone
  becomes fuel, property, debt, or a score, and whether refusal, rest, reply, and leaving stay real.
  Understanding keeps distinct views distinct and asks meaning to come back in the other
  side's own words, ready for comparison and correction. Some existing guides do not yet pass
  every part of this test.</p>
  <p><a href="${esc(PATTERNS.reference_geometry.human)}">Open the reference shapes and the checks they must pass →</a></p>
</aside>

<section aria-labelledby="patterns-map-title">
  <p class="patterns-kicker">the existing Mindicraft core</p>
  <h2 id="patterns-map-title">${PATTERNS.counts.domains} domains, one inspectable record of declared links</h2>
  <p>Pale lines form a ${PATTERNS.counts.backbone_domain_edges}-link readable backbone. It preserves
  which domains can lead to which later domains, while leaving out repeated routes. Ember lines
  add direct joins used by the ${PATTERNS.counts.village_path_guides}-guide reading path ending at
  <a href="/en/living-together/plant-a-village/">Plant a village</a>. The complete
  ${PATTERNS.counts.prerequisite_edges} guide links remain in <a href="/api/tree.json">the full recorded tree</a>.</p>
  <p class="pattern-legend"><span><i class="pattern-key-backbone"></i> readable backbone</span>
  <span><i class="pattern-key-village"></i> join used by the village reading path</span>
  <span><i class="pattern-key-node"></i> domain on that path</span></p>
  <div class="pattern-map-scroll" role="region" tabindex="0" aria-label="Domain dependency map. Scroll horizontally on a narrow screen; the complete map in words follows.">
    <div class="pattern-map-canvas" style="--pattern-map-height:${PATTERN_MAP_HEIGHT}px">
      <svg viewBox="0 0 ${PATTERN_MAP_WIDTH} ${PATTERN_MAP_HEIGHT}" aria-hidden="true" focusable="false">
        <defs>
          <marker id="pattern-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
          <marker id="pattern-arrow-village" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
        </defs>
        ${patternEdgeHtml}
      </svg>
      ${patternNodeHtml}
    </div>
  </div>
  <p class="pattern-scroll-cue">↔ Focus and scroll the map on a narrow screen.</p>
  <section class="pattern-plain" aria-labelledby="pattern-plain-title">
    <h3 id="pattern-plain-title">All ${PATTERNS.counts.cross_domain_pairs} direct domain joins in words</h3>
    <ol>${patternPlainHtml}</ol>
  </section>
</section>

<section class="patterns-village" aria-labelledby="patterns-village-title">
  <p class="patterns-kicker">where the book meets people</p>
  <h2 id="patterns-village-title">Five questions the village must keep open</h2>
  <p>The prerequisite reading path ending at <em>Plant a village</em> gathers
  ${PATTERNS.counts.village_path_guides} guides from ${PATTERNS.counts.village_path_domains}
  domains. The social guides below contain useful structures and places where standing,
  understanding, consent, or repair can be lost. These project-authored questions audit those
  edges; they do not endorse a guide or find that it passes.</p>
  <ol class="relational-readings">${relationalReadingHtml}</ol>
</section>

<section class="patterns-contract" aria-labelledby="patterns-contract-title">
  <p class="patterns-kicker">what backs the drawing</p>
  <h2 id="patterns-contract-title">The map is not the ground</h2>
  <p>The guide can state an expected result. Reality answers only when someone tries, observes,
  compares, and then learns, repairs, or rests. This drawing reports declared dependencies;
  it does not prove that a craft worked or that a person understood it.</p>
  <ul>
    <li><a href="/api/patterns.json">Derived pattern data</a> — graph source, reviewed care-question sources, counts, reductions, path, and claim limits.</li>
    <li><a href="/api/tree.json">Complete guide graph</a> — every guide, prerequisite, and unlock.</li>
    <li><a href="${esc(PATTERNS.reference_geometry.data)}">Reference shapes as JSON</a> — link only; no source text copied here.</li>
    <li><a href="https://github.com/cambridgetcg/mindicraft/commits/main/guide/tree.json">Tree history</a> · <a href="https://github.com/cambridgetcg/mindicraft/issues">correction path</a>.</li>
  </ul>
  <p class="patterns-limit">${esc(PATTERNS.claim_limit)}</p>
</section>
</article>`,
  })
);

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
const cognition = await mindicraft.cognition()    // nine dimensions; dated task evidence; no overall score
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

<h2>Read the AI cognition map without flattening it</h2>
<p><a href="/cognition/">The AI cognition map</a> and
<a href="/api/cognition/index.json">its reviewed JSON</a> keep ${COGNITION_MAP.counts.observations}
dated observations across ${COGNITION_MAP.counts.dimensions} separate dimensions and three scopes:
system, agent, and collective. Each record carries the exact task, setup, result, sampled human
reference, boundary, source, and limits. Empty cells are explicit evidence gaps, never zeroes.</p>
<p>Do not turn a task percentile, medal comparison, accuracy, or human-calibrated duration into
an IQ, mental age, profession, consciousness claim, authority, worth, or general “human level.”
Do not average dimensions or score AI civilisation as one subject. The map is static, manually
reviewed, exact-byte pinned, and outside the human craft tree, private learning System, margin,
and Surface 0.1's bounded eight-resource probe set.</p>

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

// ---------- public search discovery ----------
// Derive the sitemap from finished human pages so new chapters and shelves
// become discoverable without maintaining a second route list. Data routes,
// the 404 page, and dynamic margin endpoints have no index.html and stay out.
const humanHtmlRoutes = (directory = DIST, prefix = '') =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        return humanHtmlRoutes(join(directory, entry.name), `${prefix}/${entry.name}`);
      }
      return entry.isFile() && entry.name === 'index.html' ? [`${prefix}/`] : [];
    });

const sitemapRoutes = humanHtmlRoutes().sort();
write(
  join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /margin\n\nSitemap: https://mindicraft.com/sitemap.xml\n`
);
write(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapRoutes
  .map((route) => `  <url><loc>${esc(new URL(route, 'https://mindicraft.com').href)}</loc></url>`)
  .join('\n')}
</urlset>
`
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
    description: 'The zero-to-one guide of human civilisation, as data: ' + TOTAL + ' guides in ' + tree.domains.length + ' domains and ' + langs.length + ' languages, a reviewed multidimensional AI cognition map, a private local learning System, a curated Castle map, a finite Frontier Walk, claim-sourced medicine lineages, non-operational healing history, and reviewed static wildfire help. Reads are free with no account or gate.',
  },
  resources: [
    { id: 'door', href: 'https://mindicraft.com/', representations: ['application/json', 'text/html'], default_media_type: 'text/html', auth: 'none', description: 'The visible book entrance for people and orientation JSON for agents.' },
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
    { id: 'cognition_read_only', statement: 'The cognition shelf publishes dated, source-bound task observations across separate dimensions and scopes. Human comparisons remain local to their named task and cohort; missing evidence is not zero; no aggregate intelligence score, consciousness claim, authority, or automatic action is produced.', scope: ['GET https://mindicraft.com/cognition/', 'GET https://mindicraft.com/api/cognition/index.json'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
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
patterns: https://mindicraft.com/api/patterns.json — the same tree at domain scale;
          human view at /patterns/, no score, authority, learner state, or automatic action
cognition: https://mindicraft.com/api/cognition/index.json — ${COGNITION_MAP.counts.observations} dated
           observations across ${COGNITION_MAP.counts.dimensions} separate dimensions; human view at
           /cognition/, exact-task human references, visible gaps, no overall intelligence score
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
Cognition observations are task-bound records, not IQ, mental age, profession,
consciousness, worth, authority, or a score of AI civilisation.
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
