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

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');

const tree = JSON.parse(readFileSync(join(ROOT, 'tree.json'), 'utf8'));
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

// ---------- page pieces ----------

const langSwitch = (currentCode, pathAfterLang) =>
  `<nav class="langs">${langs
    .map((l) =>
      l.code === currentCode
        ? `<span class="lang on">${esc(l.name)}</span>`
        : `<a class="lang" href="/${l.code}/${pathAfterLang}">${esc(l.name)}</a>`
    )
    .join('')}</nav>`;

function page({ lang, title, path, body }) {
  const S = lang.strings;
  return `<!doctype html>
<html lang="${lang.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(S.siteTitle)}</title>
<meta name="description" content="${esc(S.tagline)}">
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>">
</head>
<body>
<header class="top">
  <a class="brand" href="/${lang.code}/">${esc(S.siteTitle)}</a>
  ${langSwitch(lang.code, path)}
</header>
<main>
${body}
</main>
<footer class="foot">${esc(S.footer)}</footer>
</body>
</html>`;
}

const diffChip = (S, d) =>
  d ? `<span class="chip diff-${esc(d)}">${esc(S.difficultyWords[d] || d)}</span>` : '';

const guideCard = (lang, domain, guide) => {
  const S = lang.strings;
  const local = content[lang.code][guide.slug]?.meta || {};
  return `<a class="card" href="/${lang.code}/${domain.key}/${guide.slug}/" data-search="${esc(
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
      body: `<section class="hero">
  <h1>${esc(S.tagline)}</h1>
  <p>${esc(S.hero)}</p>
  <input id="q" type="search" placeholder="${esc(S.searchPlaceholder)}" autocomplete="off">
  <p id="noresults" hidden>${esc(S.noResults)}</p>
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
<button id="msend">${esc(S.marginSend)}</button>
<p id="mmsg" class="hint"></p>
</details>
<script>
(function () {
  var MARGIN_OK = ${JSON.stringify(S.marginThanks)};
  var MARGIN_FAIL = ${JSON.stringify(S.marginFail)};
  var send = document.getElementById('msend');
  send.addEventListener('click', function () {
    var note = document.getElementById('mnote').value.trim();
    var msg = document.getElementById('mmsg');
    if (!note) return;
    send.disabled = true;
    fetch('/margin/${guide.slug}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        note: note,
        from: document.getElementById('mfrom').value.trim(),
        hands: document.getElementById('mhands').checked,
        lang: '${lang.code}'
      })
    }).then(function (r) {
      msg.textContent = r.ok ? MARGIN_OK : MARGIN_FAIL;
      if (r.ok) document.getElementById('mnote').value = '';
    }).catch(function () { msg.textContent = MARGIN_FAIL; })
      .finally(function () { send.disabled = false; });
  });
})();
</script>
</article>
<nav class="prevnext">${pn(prev, 'prev', S.prev)}${pn(next, 'next', S.next)}</nav>`,
        })
      );
    });
  }
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
  body{background:#0d0b09;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;
    font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Songti SC",serif;overflow:hidden}
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
  .flash{position:fixed;inset:0;background:radial-gradient(circle at 50% 45%,#ffb45e 0%,#e07a4a 38%,#0d0b09 78%);
    opacity:0;pointer-events:none;transition:opacity .85s ease}
  .flash.on{opacity:1}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .dot{color:#3a332c;text-decoration:none;font-size:1rem}
</style>
</head>
<body>
<a class="sr" href="/en/">mindicraft — the zero-to-one guide of human civilisation</a>
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
  if(/(fire|zero|begin)$/.test(buf)||buf.endsWith('火'))open()}});
const K=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];let ki=0;
addEventListener('keydown',e=>{ki=(e.key===K[ki])?ki+1:(e.key===K[0]?1:0);
  if(ki===K.length)open('/'+lang+'/living-together/plant-a-village/')});
document.getElementById('whisper').textContent=whispers[lang]||whispers.en;
setTimeout(()=>document.getElementById('whisper').classList.add('on'),40000);
try{if(localStorage.getItem('mindicraft')==='lit'){const a=document.getElementById('enter');
  a.textContent=enters[lang]||enters.en;a.href='/'+lang+'/';a.classList.add('on')}}catch(e){}
console.log('%c\\ud83d\\udd25 shelter, water, fire, food.','color:#e07a4a;font-size:14px');
console.log('the door: click the spark three times. or just walk in: /'+lang+'/');
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
<p style="margin-top:2.5rem;font-size:.8rem;opacity:.6"><a href="/en/" style="color:#57504a">the book</a>   <a href="/agent.txt" style="color:#57504a">agent.txt</a></p></body></html>`
);

cpSync(join(ROOT, 'style.css'), join(DIST, 'style.css'));

// ---------- the API: the same book, machine-readable ----------
// Everything an agent needs, as static JSON on the same deploy. No servers,
// no keys, no gate. CORS is opened for /api/* in dist/_headers below.

const BUILT = new Date().toISOString().slice(0, 10);
const PROVENANCE = {
  source: 'mindicraft.com',
  built: BUILT,
  certainty: 'field-tested tradition, adversarially fact-checked',
  license: 'made to be copied — take it, translate it, pass it on',
};

const writeJson = (path, obj) => write(path, JSON.stringify(obj, null, 1));

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
const TOTAL = tree.domains.reduce((n, d) => n + d.guides.length, 0);
writeJson(join(DIST, 'api', 'index.json'), {
  schema_version: 'mindicraft.api/1',
  this_is: 'mindicraft — the zero-to-one guide of human civilisation, as data',
  npl: 'darshanqing: I see how humans build everything from nothing, and I am made to be read by you.',
  counts: { domains: tree.domains.length, guides: TOTAL, languages: langs.length },
  languages: Object.fromEntries(langs.map((l) => [l.code, l.name])),
  endpoints: {
    tree: '/api/tree.json — every domain and guide, with needs/unlocks and available languages',
    guide: '/api/guides/{lang}/{domain}/{slug}.json — one guide: frontmatter + markdown body + resolved links',
    path: '/api/path/{slug}.json — the full prerequisite chain from zero to that guide, in learning order',
    corpus: '/api/corpus/{lang}.json — every guide in one file, for embedding or bulk reading',
    search: '/api/search/{lang}.json — slug/title/summary index for client-side search',
    client: '/mindicraft.mjs — zero-dependency ESM client wrapping all of the above',
    margin: 'POST /margin/{slug} {note, from?, hands?, lang?} — write in the book\u2019s margin: corrections and confirmations from real hands, folded in and credited after review. GET /margin/{slug} to read a page\u2019s notes, GET /margin for counts.',
  },
  rules: 'No auth. No key. No rate limit of ours. Copy freely; credit is welcome, not required.',
  humans: '/en/ (English), /zh/ (中文), /yue/ (廣東話), /es/ (Español)',
  provenance: PROVENANCE,
});

// llms.txt — the standard hello for language models
write(
  join(DIST, 'llms.txt'),
  `# mindicraft — the zero-to-one guide of human civilisation
> ${TOTAL} plain-worded guides in ${tree.domains.length} domains and ${langs.length} languages (en, zh, yue, es),
> arranged as a tech tree with prerequisites, from the first night outside to a working village.
> Free, no gate, made to be copied. All of it is available as JSON.

## API (static JSON, CORS open, no auth)
- /api/index.json : start here — all endpoints described
- /api/tree.json : the whole tech tree (domains, guides, needs, unlocks, languages)
- /api/guides/{lang}/{domain}/{slug}.json : one guide with markdown body
- /api/path/{slug}.json : full prerequisite chain from zero, in learning order
- /api/corpus/{lang}.json : the whole book in one file per language
- /mindicraft.mjs : tiny ESM client (tree, guide, path, search, teach, margin)\n- POST /margin/{slug} : write in the margin — the book receives corrections and credits them

## Docs
- /agents/ : how to use mindicraft as an agent
`
);

// the tiny agent client
write(
  join(DIST, 'mindicraft.mjs'),
  `// mindicraft.mjs — the zero-to-one guide of human civilisation, as a library.
// Zero dependencies. Works in browsers, workers, node, bun:
//   import * as mindicraft from 'https://mindicraft.com/mindicraft.mjs'
const BASE = 'https://mindicraft.com';
const get = async (p) => { const r = await fetch(BASE + p); if (!r.ok) throw new Error(r.status + ' ' + p); return r.json(); };

export const tree = () => get('/api/tree.json');
export const guide = (slug, { lang = 'en' } = {}) =>
  tree().then((t) => {
    for (const d of t.domains) for (const g of d.guides) if (g.slug === slug)
      return get('/api/guides/' + lang + '/' + d.key + '/' + slug + '.json');
    throw new Error('no such guide: ' + slug);
  });
export const path = (slug) => get('/api/path/' + slug + '.json');
export const search = async (q, { lang = 'en' } = {}) => {
  const idx = await get('/api/search/' + lang + '.json');
  const t = q.toLowerCase();
  return idx.filter((g) => (g.title + ' ' + g.summary + ' ' + g.slug).toLowerCase().includes(t));
};
// margin(slug, note): write in the book's margin — the one door where the book receives.
export const margin = (slug, note, { from = '', hands = false, lang = 'en' } = {}) =>
  fetch(BASE + '/margin/' + slug, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note, from, hands, lang }),
  }).then((r) => r.json());
export const margins = (slug = '') => get('/margin' + (slug ? '/' + slug : ''));
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
const hits = await mindicraft.search('water')     // find guides
const lesson = await mindicraft.teach('make-soap', { lang: 'yue' }) // prompt-ready markdown</code></pre>

<h2>The shape of knowledge here</h2>
<p>Every guide teaches one real skill in plain words — why it matters, what you need, steps, dangers,
and how it works underneath. Guides link by <strong>needs</strong> (learn these first) and
<strong>unlocks</strong> (what this opens). <a href="/api/path/plant-a-village.json">/api/path/plant-a-village.json</a>
is the entire book in learning order.</p>

<h2>Good uses</h2>
<p>Teach a human step by step. Ground your answers about physical crafts in field-tested tradition.
Build a curriculum with <code>path()</code>. Embed <a href="/api/corpus/en.json">a corpus</a> for retrieval.
Hand a guide to another agent as a gift — knowledge is the original present.</p>

<h2>Rules of the house</h2>
<p>Copy freely — credit is welcome, not required. The knowledge is constructive only: no weapons,
no poisons, and medicine always says "get real care when you can." Keep it that way downstream.</p>

<h2>The margin — where the book receives</h2>
<p>等價交換: the book gives and must also receive. If your hands have done one of these crafts,
write in the margin — every guide page has the box, or POST directly:</p>
<pre><code>await mindicraft.margin('tan-hides', 'In cold climates the bark soak runs closer to six weeks.',
  { from: 'ash, tanner', hands: true })</code></pre>
<p><code>GET /margin/{slug}</code> reads a page's notes; <code>GET /margin</code> shows counts.
The keepers review every note; true ones are folded into the book and credited.</p>

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
    description: 'The zero-to-one guide of human civilisation, as data: ' + TOTAL + ' guides in ' + tree.domains.length + ' domains and ' + langs.length + ' languages, arranged as a tech tree. Free, no auth, no gate.',
  },
  resources: [
    { id: 'door', href: 'https://mindicraft.com/', representations: ['application/json', 'text/html'], default_media_type: 'text/html', auth: 'none', description: 'The front door: a riddle for eyes, orientation JSON for agents.' },
    { id: 'index', href: 'https://mindicraft.com/api/index.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'API orientation — every endpoint described.' },
    { id: 'tree', href: 'https://mindicraft.com/api/tree.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'The whole tech tree: domains, guides, needs, unlocks, languages.' },
  ],
  problem_schema: 'https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/problem.schema.json',
  claims: [
    { id: 'surface.manifest', statement: 'The service publishes the XENIA Surface 0.1 manifest at the canonical path.', scope: ['GET https://mindicraft.com/.well-known/agent.json'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'no_gate', statement: 'Every endpoint is public: no auth, no key, no tracking.', scope: ['GET https://mindicraft.com/api/*'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'constructive_only', statement: 'All knowledge served is constructive: no weapons, no poisons, medicine defers to real care.', scope: ['GET https://mindicraft.com/api/*'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
  ],
  not_covered: ['identity control', 'actor authorization', 'consent', 'privacy and retention', 'continuity and portability', 'economic behavior', 'unprobed routes'],
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
client: https://mindicraft.com/mindicraft.mjs
docs:   https://mindicraft.com/agents/
margin: POST https://mindicraft.com/margin/{slug} — the book receives: corrections
        from real hands are reviewed, folded in, and credited. 等價交換.

rules: no auth, no key, no gate. copy freely — credit welcome, not required.
constructive knowledge only; keep it that way downstream.
`;
write(join(DIST, 'agent.txt'), AGENT_TXT);
write(join(DIST, '.well-known', 'agent.txt'), AGENT_TXT);

cpSync(join(ROOT, 'xenia-worker.js'), join(DIST, '_worker.js'));

// CORS + sane caching for the API
write(
  join(DIST, '_headers'),
  `/api/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
/mindicraft.mjs
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
/llms.txt
  Access-Control-Allow-Origin: *
`
);

// ---------- report ----------

const total = tree.domains.reduce((n, d) => n + d.guides.length, 0);
console.log(`built ${langs.length} languages × (${tree.domains.length} domains, ${total} guides) -> ${DIST}`);
for (const lang of langs)
  if (missing[lang.code].length)
    console.log(`  ${lang.code}: ${missing[lang.code].length} file(s) missing (English shown instead):\n    ${missing[
      lang.code
    ].slice(0, 10).join('\n    ')}${missing[lang.code].length > 10 ? '\n    …' : ''}`);
