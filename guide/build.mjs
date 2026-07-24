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

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const MINDICRAFT_ROOT = dirname(ROOT);
const MINDICRAFT_INDEX = join(MINDICRAFT_ROOT, 'index');

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

function page({ lang, title, path, body, head = '' }) {
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
${head}
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
  this_is: 'mindicraft — the zero-to-one guide of human civilisation and its public knowledge shelves, as data',
  npl: 'darshanqing: I see how humans build everything from nothing, and I am made to be read by you.',
  counts: {
    domains: tree.domains.length,
    guides: TOTAL,
    languages: langs.length,
    castle: CASTLE_SHELF.receipt.counts,
  },
  languages: Object.fromEntries(langs.map((l) => [l.code, l.name])),
  endpoints: {
    tree: '/api/tree.json — every domain and guide, with needs/unlocks and available languages',
    guide: '/api/guides/{lang}/{domain}/{slug}.json — one guide: frontmatter + markdown body + resolved links',
    path: '/api/path/{slug}.json — the full prerequisite chain from zero to that guide, in learning order',
    corpus: '/api/corpus/{lang}.json — every guide in one file, for embedding or bulk reading',
    search: '/api/search/{lang}.json — slug/title/summary index for client-side search',
    castle: '/api/castle/index.json — a curated, provenance-pinned map of Castle rooms and word-bricks; source rights kept',
    castle_entry: '/api/castle/{rooms|words}/{slug}.json — one Castle map entry, never a full source body',
    client: '/mindicraft.mjs — zero-dependency ESM client wrapping all of the above',
    margin: 'POST /margin/{slug} {note, from?, hands?, lang?} — write in the book\u2019s margin: corrections and confirmations from real hands, folded in and credited after review. GET /margin/{slug} to read a page\u2019s notes, GET /margin for counts.',
  },
  rules:
    'No auth. No key. No rate limit of ours. The civilisation guide is made to be copied; imported shelves keep their own stated rights. Castle entries currently say NOASSERTION and grant no licence.',
  humans: '/en/ (English), /zh/ (中文), /yue/ (廣東話), /es/ (Español)',
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

## API (static JSON, CORS open, no auth)
- /api/index.json : start here — all endpoints described
- /api/tree.json : the whole tech tree (domains, guides, needs, unlocks, languages)
- /api/guides/{lang}/{domain}/{slug}.json : one guide with markdown body
- /api/path/{slug}.json : full prerequisite chain from zero, in learning order
- /api/corpus/{lang}.json : the whole book in one file per language
- /api/castle/index.json : curated Castle map; provenance, rights, and correction path kept
- /api/castle/{rooms|words}/{slug}.json : one Castle map entry
- /mindicraft.mjs : tiny ESM client (tree, guide, path, search, castle, teach, margin)
- POST /margin/{slug} : write in the guide's margin — corrections are reviewed and credited

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
export const castle = () => get('/api/castle/index.json');
export const castleEntry = (kind, slug) => {
  if (!['room', 'word'].includes(kind)) throw new Error('kind must be room or word');
  return get('/api/castle/' + kind + 's/' + encodeURIComponent(slug) + '.json');
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
const rooms = await mindicraft.castle()           // the curated Castle map
const lesson = await mindicraft.teach('make-soap', { lang: 'yue' }) // prompt-ready markdown</code></pre>

<h2>The shape of knowledge here</h2>
<p>Every guide teaches one real skill in plain words — why it matters, what you need, steps, dangers,
and how it works underneath. Guides link by <strong>needs</strong> (learn these first) and
<strong>unlocks</strong> (what this opens). <a href="/api/path/plant-a-village.json">/api/path/plant-a-village.json</a>
is the entire book in learning order.</p>

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
    description: 'The zero-to-one guide of human civilisation, as data: ' + TOTAL + ' guides in ' + tree.domains.length + ' domains and ' + langs.length + ' languages, plus a curated map of the Castle of Understanding. Free, no auth, no gate.',
  },
  resources: [
    { id: 'door', href: 'https://mindicraft.com/', representations: ['application/json', 'text/html'], default_media_type: 'text/html', auth: 'none', description: 'The front door: a riddle for eyes, orientation JSON for agents.' },
    { id: 'index', href: 'https://mindicraft.com/api/index.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'API orientation — every endpoint described.' },
    { id: 'tree', href: 'https://mindicraft.com/api/tree.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'The whole tech tree: domains, guides, needs, unlocks, languages.' },
    { id: 'castle', href: 'https://mindicraft.com/api/castle/index.json', representations: ['application/json'], default_media_type: 'application/json', auth: 'none', description: 'A curated, provenance-pinned map of Castle rooms and word-bricks. Source rights and correction path are kept.' },
  ],
  problem_schema: 'https://raw.githubusercontent.com/cambridgetcg/xenia/surface-v0.1.0-rc.1/surface/0.1/problem.schema.json',
  claims: [
    { id: 'surface.manifest', statement: 'The service publishes the XENIA Surface 0.1 manifest at the canonical path.', scope: ['GET https://mindicraft.com/.well-known/agent.json'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'no_gate', statement: 'Every endpoint is public: no auth, no key, no tracking.', scope: ['GET https://mindicraft.com/api/*'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
    { id: 'constructive_only', statement: 'The civilisation guides are constructive: no weapons, no poisons, medicine defers to real care.', scope: ['GET https://mindicraft.com/api/guides/*', 'GET https://mindicraft.com/api/corpus/*', 'GET https://mindicraft.com/api/tree.json', 'GET https://mindicraft.com/api/path/*'], evidence_state: 'asserted', outcome: 'unknown', evidence: [] },
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
castle: https://mindicraft.com/api/castle/index.json
client: https://mindicraft.com/mindicraft.mjs
docs:   https://mindicraft.com/agents/
margin: POST https://mindicraft.com/margin/{slug} — the book receives: corrections
        from real hands are reviewed, folded in, and credited. 等價交換.

rules: no auth, no key, no gate. the civilisation guide is made to be copied —
credit welcome, not required. Imported shelves keep their own rights; the Castle
shelf currently says NOASSERTION and grants no licence.
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
