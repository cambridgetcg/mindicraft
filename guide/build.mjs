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
<p class="meta">${diffChip(S, guide.difficulty)}<span class="chip">⏳ ${esc(meta.time || guide.time || '')}</span></p>
${needs.length ? `<div class="box needs"><strong>${esc(S.youNeedFirst)}:</strong> ${needs.join(' · ')}</div>` : ''}
${marked.parse(doc.body)}
${opens.length ? `<div class="box opens"><strong>${esc(S.unlocks)}:</strong> ${opens.join(' · ')}</div>` : ''}
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
    background:#e07a4a;box-shadow:0 0 .3em .04em rgba(224,122,74,.5);cursor:pointer;
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
const lang=(navigator.languages||[navigator.language||'en']).map(l=>l.slice(0,2).toLowerCase()).find(w=>have.includes(w))||'en';
const whispers={en:'everything begins with a spark',zh:'一切从一粒火星开始',es:'todo empieza con una chispa'};
const enters={en:'enter',zh:'进',es:'entra'};
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
<body><p>not every path is a door.</p><a href="/" aria-label="back to the spark">·</a></body></html>`
);

cpSync(join(ROOT, 'style.css'), join(DIST, 'style.css'));

// ---------- report ----------

const total = tree.domains.reduce((n, d) => n + d.guides.length, 0);
console.log(`built ${langs.length} languages × (${tree.domains.length} domains, ${total} guides) -> ${DIST}`);
for (const lang of langs)
  if (missing[lang.code].length)
    console.log(`  ${lang.code}: ${missing[lang.code].length} file(s) missing (English shown instead):\n    ${missing[
      lang.code
    ].slice(0, 10).join('\n    ')}${missing[lang.code].length > 10 ? '\n    …' : ''}`);
