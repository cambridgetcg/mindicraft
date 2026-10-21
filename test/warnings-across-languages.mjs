// Offline reviewer aid. Importing this module performs no reads or writes.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANGUAGES = ['en', 'zh', 'yue', 'es'];
const steps = ['Steps', '步骤', '點做', 'Pasos'];
const warnings = ['Watch out', '小心', '小心', 'Cuidado'];
const selectors = (sections, anchors) => Object.fromEntries(
  LANGUAGES.map((lang, i) => [lang, { section: sections[i], anchor: anchors[i] }])
);

export const PILOT = {
  id: 'bleeding-referral',
  history: 'guide/REVIEW.md — reviewed 2026-07-16; treat-cuts/when-to-get-help reconciliation recorded in 72acae8 (2026-07-16, git date); last document follow-up 912ac7d (2026-07-17, git date)',
  selected_on: '2026-10-21', // Selection date, never a medical review date.
  roles: [
    {
      id: 'pressure', guide: 'staying-well/treat-cuts', quantity_group: 'duration',
      selectors: selectors(steps, [
        'Keep pressing without peeking', '一直按整整', '一直撳住足足',
        'Sigue presionando sin espiar',
      ]),
    },
    {
      id: 'referral', guide: 'staying-well/treat-cuts', quantity_group: 'duration',
      selectors: selectors(warnings, [
        'Go for real care straight away', '以下情况直接去就医',
        '以下情況要即刻去搵真正嘅照顧', 'Ve por atención de verdad de inmediato',
      ]),
    },
    {
      id: 'trigger', guide: 'staying-well/when-to-get-help', quantity_group: 'duration',
      selectors: selectors(steps, [
        'Bleeding that will not stop', '血止不住', '流血止唔到', 'Un sangrado que no para',
      ]),
    },
    {
      id: 'onward-care', guide: 'staying-well/when-to-get-help',
      selectors: selectors(steps, [
        'Keep care going on the way', '路上照顾不能停', '喺路上都要繼續照顧',
        'Sigue cuidando en el camino',
      ]),
    },
  ],
};

const QUESTIONS = [
  ['bilingual', 'selection', 'Do these excerpts and their parent lines cover the same warning? Read the full files for exceptions and missing context.'],
  ['bilingual', 'conditions', 'Are the trigger, affected person, threshold, exceptions and timing preserved? Could the wording imply waiting when action is required?'],
  ['bilingual', 'prohibitions', 'Are every prohibition, negation and limit preserved, with the same scope and force?'],
  ['bilingual', 'actions', 'Are required actions, urgency, order and concurrent actions preserved across languages and related guides?'],
  ['bilingual', 'quantities', 'Check raw quantities, units, qualifiers and what each number modifies, including expressions the extractor does not understand.'],
  ['subject', 'correctness', 'Is the source claim itself correct for this context? Supply dated authoritative evidence; agreement across languages cannot answer this. External evidence is to re-observe.'],
];

const plain = (text) => text.replaceAll('**', '').replaceAll('__', '').trim();
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const sourcePath = (guide, lang) => `guide/content/${lang}/${guide}.md`;

// Only the book's ATX headings and space-indented list items, not a Markdown renderer.
// Preserve physical line numbers; ignore frontmatter and fenced examples.
export function inspectMarkdown(raw) {
  const lines = raw.split(/\r?\n/u);
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end === -1) throw new Error('Unclosed frontmatter');
    start = end + 1;
  }
  const headings = [];
  const items = [];
  const stack = [];
  let section = '';
  let fence = null;
  const close = (at, indent = -1) => {
    while (stack.length && stack.at(-1).indent >= indent) {
      const item = stack.pop();
      let end = at;
      while (end > item.line && !lines[end - 1].trim()) end--;
      item.end_line = end;
      item.text = lines.slice(item.line - 1, end).join('\n');
    }
  };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`, 'u').test(line)) fence = null;
      continue;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/u);
    if (opening) {
      close(i);
      fence = { char: opening[1][0], length: opening[1].length };
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/u);
    if (heading) {
      close(i);
      section = plain(heading[2]);
      headings.push({ line: i + 1, level: heading[1].length, text: section });
      continue;
    }
    const marker = line.match(/^( *)([-+*]|\d+[.)])\s+(.+)$/u);
    if (marker) {
      const indent = marker[1].length;
      close(i, indent);
      const item = {
        line: i + 1, indent, marker: marker[2], section,
        lead: plain(marker[3]),
        parents: stack.map((parent) => ({ line: parent.line, text: lines[parent.line - 1] })),
      };
      items.push(item);
      stack.push(item);
    } else if (line.trim() && stack.length && line.search(/\S/u) <= stack.at(-1).indent) {
      close(i);
    }
  }
  close(lines.length);
  if (fence) throw new Error('Unclosed code fence');
  return {
    headings, items,
    structure: {
      heading_levels: headings.map((h) => h.level),
      lists: items.map((item) => [item.indent, /^\d/u.test(item.marker) ? item.marker.replace(')', '.') : '-']),
    },
  };
}

// A deliberately small lexicon. No unit conversion, clinical target or semantic model.
const NUMBER_WORDS = { ten: 10, fifteen: 15, thirty: 30, diez: 10, quince: 15, treinta: 30 };
const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function numberValue(token) {
  if (/^[+-]?\d+(?:[.,]\d+)?$/u.test(token)) {
    // Do not silently round large values or choose a thousands/decimal convention.
    if (token.replace(/\D/gu, '').length > 15 || /^[+-]?\d{1,3}[.,]\d{3}$/u.test(token)) return null;
    return Number(token.replace(',', '.'));
  }
  if (Object.hasOwn(NUMBER_WORDS, token.toLowerCase())) return NUMBER_WORDS[token.toLowerCase()];
  if (Object.hasOwn(DIGITS, token)) return DIGITS[token];
  if (/^[一二三四五六七八九]?十[一二三四五六七八九]?$/u.test(token)) {
    const [tens, ones] = token.split('十');
    return (tens ? DIGITS[tens] : 1) * 10 + (ones ? DIGITS[ones] : 0);
  }
  return null;
}

export function extractQuantities(text, firstLine = 1) {
  const quantities = [];
  for (const [offset, line] of text.split('\n').entries()) {
    // Units are time-only in this pilot. Numberless units remain visible as unparsed.
    const units = /(?<![\p{L}])(minutes?|mins?|seconds?|hours?|minutos?|segundos?|horas?)(?![\p{L}])|分钟|分鐘|秒钟|秒鐘|秒|小时|小時|鐘頭|钟头/giu;
    for (const match of line.matchAll(units)) {
      const prefix = line.slice(0, match.index);
      const number = prefix.match(/([+-]?[\d０-９]+(?:[.,，．/–—-][\d０-９]+)*|[零〇一二两兩三四五六七八九十百千万萬億]+|[\p{Script=Latin}-]+)(?:\s+(?:full|complete))?\s*$/iu);
      const token = number?.[1] ?? '';
      const rawUnit = match[0];
      const unit = /^(?:min|分钟|分鐘)/iu.test(rawUnit) ? 'minute'
        : /^(?:sec|seg|秒)/iu.test(rawUnit) ? 'second' : 'hour';
      // Recognize a few unsupported compound/range contexts without pretending to
      // parse them. This is still a bounded lexicon, not natural-language arithmetic.
      const beforeNumber = prefix.slice(0, number?.index ?? prefix.length);
      const compound = /(?:\b(?:hundred|thousand|million|billion|cien|ciento|mil|millones|and|or|y|o|u|to|a)\s+|[至到或]\s*)$/iu.test(beforeNumber);
      const value = compound ? null : numberValue(token.normalize('NFKC'));
      quantities.push({
        line: firstLine + offset, column: (number?.index ?? match.index) + 1,
        raw: line.slice(number?.index ?? match.index, match.index + rawUnit.length),
        number: token, unit_text: rawUnit, value, unit,
        status: value === null ? 'unparsed' : 'candidate',
      });
    }
  }
  return quantities;
}

export function buildReport(documents, pilot = PILOT) {
  const sources = [];
  const passages = [];
  const signals = [];
  const parsed = new Map();
  const signal = (code, paths, detail) => signals.push({ code, paths, detail });
  for (const guide of [...new Set(pilot.roles.map((r) => r.guide))]) {
    for (const lang of LANGUAGES) {
      const path = sourcePath(guide, lang);
      const raw = documents[path];
      const source = { path, lang, guide, status: 'missing', sha256: null };
      sources.push(source);
      if (typeof raw !== 'string') {
        signal('source-missing', [path], 'No fallback language was substituted.');
        continue;
      }
      source.sha256 = sha256(raw);
      try {
        const doc = inspectMarkdown(raw);
        source.status = 'available';
        source.headings = doc.headings;
        source.structure = doc.structure;
        parsed.set(path, doc);
      } catch {
        source.status = 'unparsed';
        signal('source-unparsed', [path], 'Check frontmatter and fenced blocks.');
      }
    }
    const peers = sources.filter((s) => s.guide === guide && s.status === 'available');
    const reference = peers.find((s) => s.lang === 'en');
    for (const peer of peers) {
      if (reference && JSON.stringify(peer.structure) !== JSON.stringify(reference.structure)) {
        signal('structure-difference', [reference.path, peer.path], 'Heading levels or list layout differ; formatting alone can cause this.');
      }
    }
  }
  for (const role of pilot.roles) {
    for (const lang of LANGUAGES) {
      const path = sourcePath(role.guide, lang);
      const selector = role.selectors[lang];
      const matches = (parsed.get(path)?.items ?? []).filter(
        (item) => item.section === selector.section && item.lead.startsWith(selector.anchor)
      ).map((item) => ({
        line: item.line, end_line: item.end_line, text: item.text, parents: item.parents,
        quantities: extractQuantities(item.text, item.line),
      }));
      const status = matches.length === 1 ? 'located' : matches.length ? 'ambiguous' : 'missing';
      passages.push({ role: role.id, lang, path, selector, status, matches });
      if (status !== 'located') signal(`passage-${status}`, [path], `${role.id}: ${matches.length} matches; review the selector and full source.`);
      for (const match of matches) {
        if (match.quantities.some((q) => q.status === 'unparsed')) {
          signal('quantity-unparsed', [path], `${role.id}: a time unit has no supported number; read the original expression.`);
        }
      }
    }
  }
  // Comparison groups span languages AND related guides. No fixed 'correct' number.
  const comparisons = [];
  const groups = [...new Set(pilot.roles.map((r) => r.quantity_group ?? r.id))];
  for (const group of groups) {
    const roles = pilot.roles.filter((r) => (r.quantity_group ?? r.id) === group).map((r) => r.id);
    const members = passages.filter((p) => roles.includes(p.role));
    const comparable = members.every((p) => p.status === 'located' && p.matches[0].quantities.every((q) => q.status === 'candidate'));
    const signatures = members.map((p) => p.status === 'located'
      ? p.matches[0].quantities.map((q) => `${q.value}:${q.unit}`).sort() : null);
    const different = comparable && new Set(signatures.map((s) => JSON.stringify(s))).size > 1;
    comparisons.push({ group, status: !comparable ? 'incomplete' : different ? 'different'
      : signatures.every((s) => s.length === 0) ? 'no-quantities-extracted' : 'no-numeric-difference-detected' });
    if (different) signal('quantity-difference', members.map((p) => p.path), `${group}: extracted quantity multisets differ; no value is endorsed.`);
  }
  return {
    schema_version: 'mindicraft.warning-review/1', pilot: pilot.id,
    history: pilot.history, selected_on: pilot.selected_on,
    boundary: 'Reviewer excerpts, not care instructions. No semantic equivalence or safety verdict. English is a comparison reference, not factual authority.',
    limits: 'Only selected list items; ATX headings, list layout, and a small time-number lexicon. No negation, conditions, urgency, unit conversion or factual validation. Read full sources.',
    sources, passages, comparisons, signals,
    review_questions: QUESTIONS.flatMap(([review, id, question]) =>
      (review === 'bilingual' ? LANGUAGES.slice(1) : [null]).map((lang) => ({
        id: lang ? `${id}-en-${lang}` : id, review, languages: lang ? ['en', lang] : LANGUAGES,
        status: 'pending', question,
      }))
    ),
  };
}

export function renderReport(report) {
  const lines = [
    `Warning review: ${report.pilot}`, report.boundary, report.limits,
    `History: ${report.history}`, `Pilot selection: ${report.selected_on} (not safety review)`,
    '', 'SOURCE BYTES (digests identify text, not approval)',
    ...report.sources.map((s) => `${s.path} | ${s.status} | sha256:${s.sha256 ?? 'unavailable'}`),
    '', 'RELATED EXCERPTS — unreviewed source quotations',
  ];
  for (const p of report.passages) {
    lines.push('', `${p.role} / ${p.lang} | ${p.path} | ${p.status}`);
    for (const m of p.matches) {
      for (const parent of m.parents) lines.push(`  parent ${parent.line}: ${parent.text}`);
      for (const [offset, line] of m.text.split('\n').entries()) lines.push(`  ${m.line + offset}: ${line}`);
      lines.push(`  time quantities: ${m.quantities.length ? JSON.stringify(m.quantities) : 'none extracted (not proof of absence)'}`);
    }
  }
  lines.push('', 'MECHANICAL SIGNALS (not a pass/fail safety result)');
  for (const c of report.comparisons) lines.push(`${c.group}: ${c.status}`);
  for (const s of report.signals) lines.push(`${s.code}: ${s.paths.join(', ')} — ${s.detail}`);
  if (!report.signals.length) lines.push('No mechanical signal; all review questions remain pending.');
  lines.push('', 'REVIEW QUESTIONS');
  for (const q of report.review_questions) lines.push(`[${q.status}] ${q.id} (${q.review}): ${q.question}`);
  return `${lines.join('\n')}\n`;
}

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node test/warnings-across-languages.mjs [--json]\nRead-only, offline pilot. Exit 0 means report produced, never safety approval; exit 1 means input/tool failure.\n');
    return;
  }
  if (args.length > 1 || (args.length && args[0] !== '--json')) {
    process.stderr.write('Usage: node test/warnings-across-languages.mjs [--json]\n');
    process.exitCode = 1;
    return;
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const documents = {};
  for (const guide of [...new Set(PILOT.roles.map((r) => r.guide))]) {
    for (const lang of LANGUAGES) {
      const path = sourcePath(guide, lang);
      try {
        documents[path] = readFileSync(join(root, path), 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          process.stderr.write(`Cannot read ${path}; no report produced.\n`);
          process.exitCode = 1;
          return;
        }
      }
    }
  }
  const report = buildReport(documents);
  process.stdout.write(args[0] === '--json' ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report));
  if (report.sources.some((s) => s.status !== 'available')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
