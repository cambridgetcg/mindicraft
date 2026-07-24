#!/usr/bin/env node
// castle-to-mindicraft.mjs
//
// Build a small, searchable map of the Castle of Understanding inside
// Mindicraft. The source is Castle Gate's curated, commit-pinned public
// snapshot — never the Castle's live working tree.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GATE = join(homedir(), 'castle-gate');
const DEFAULT_OUTPUT = join(REPO, 'index');
const DEFAULT_PUBLIC_BASE = 'https://cambridgetcg.github.io/castle-gate';
const OFF_FILE = join(REPO, '.castle-mindicraft.off');
const MAX_ENTRIES = 2000;
const ROOM_PREFIX = 'castle-room-';
const WORD_PREFIX = 'castle-word-';
const RECEIPT_FILE = '_castle-sync.json';
const SAFE_SLUG = /^[\p{L}\p{N}][\p{L}\p{N}-]*$/u;
const ordered = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function usage() {
  return `Castle → Mindicraft

Reads Castle Gate's curated, pinned public snapshot and builds metadata cards.
The default is a dry run.

Usage:
  node castle-to-mindicraft.mjs
  node castle-to-mindicraft.mjs --write
  node castle-to-mindicraft.mjs --check

Options:
  --write             write or update generated entries
  --check             exit 1 when generated entries differ
  --dry-run           report changes without writing (the default)
  --prune             with --write, remove stale generated entries
  --manifest PATH     Castle Gate manifest
  --manifest-revision COMMIT
                      read the manifest from this full Gate commit
  --manifest-digest SHA256
                      required pin for a manifest outside the Gate repo
  --snapshot PATH     exact snapshot bytes named by the manifest
  --gate-repo PATH    local Castle Gate Git repository
  --output PATH       Mindicraft index directory
  --base-url URL      public Castle Gate base URL
  --help              show this help

Off-switches:
  CASTLE_MINDICRAFT=off
  touch ${OFF_FILE}
`;
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    mode: 'dry-run',
    prune: false,
    gateRepo: DEFAULT_GATE,
    output: DEFAULT_OUTPUT,
    baseUrl: DEFAULT_PUBLIC_BASE,
    manifest: null,
    manifestRevision: null,
    manifestDigest: null,
    snapshot: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write') options.mode = 'write';
    else if (arg === '--check') options.mode = 'check';
    else if (arg === '--dry-run') options.mode = 'dry-run';
    else if (arg === '--prune') options.prune = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (
      [
        '--manifest',
        '--manifest-revision',
        '--manifest-digest',
        '--snapshot',
        '--gate-repo',
        '--output',
        '--base-url',
      ].includes(arg)
    ) {
      const value = argv[++i];
      if (!value) fail(`${arg} needs a value`);
      const key = {
        '--manifest': 'manifest',
        '--manifest-revision': 'manifestRevision',
        '--manifest-digest': 'manifestDigest',
        '--snapshot': 'snapshot',
        '--gate-repo': 'gateRepo',
        '--output': 'output',
        '--base-url': 'baseUrl',
      }[arg];
      options[key] = value;
    } else {
      fail(`unknown option: ${arg}`);
    }
  }

  if (options.prune && options.mode !== 'write') {
    fail('--prune is only allowed with --write');
  }
  if (
    options.manifestRevision &&
    !/^[0-9a-f]{40}$/.test(options.manifestRevision)
  ) {
    fail('--manifest-revision must be a full Git commit');
  }
  if (
    options.manifestDigest &&
    !/^sha256:[0-9a-f]{64}$/.test(options.manifestDigest)
  ) {
    fail('--manifest-digest must be a sha256 digest');
  }

  options.gateRepo = resolve(options.gateRepo);
  options.output = resolve(options.output);
  options.manifest = resolve(
    options.manifest || join(options.gateRepo, 'data', 'castle-manifest.json')
  );
  if (options.snapshot) options.snapshot = resolve(options.snapshot);
  options.baseUrl = options.baseUrl.replace(/\/+$/, '');

  let parsedBase;
  try {
    parsedBase = new URL(options.baseUrl);
  } catch {
    fail('--base-url must be a valid HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(parsedBase.protocol)) {
    fail('--base-url must be a valid HTTP(S) URL');
  }

  return options;
}

function readJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    fail(`cannot read ${label} at ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function pathInside(root, path) {
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) return null;
  return rel.split(sep).join('/');
}

function gitOutput(repo, args, label) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    fail(`${label}: ${detail}`);
  }
}

function loadManifest(options) {
  const repoPath = pathInside(options.gateRepo, options.manifest);
  let revision = options.manifestRevision;

  if (revision && !repoPath) {
    fail('--manifest-revision needs a manifest inside --gate-repo');
  }
  if (!revision && repoPath) {
    revision = gitOutput(
      options.gateRepo,
      ['log', '-1', '--format=%H', '--', repoPath],
      'cannot find the committed Castle manifest'
    )
      .toString('utf8')
      .trim();
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      fail('Castle manifest is not committed; pin it with --manifest-digest');
    }
  }

  let bytes;
  if (revision) {
    bytes = gitOutput(
      options.gateRepo,
      ['show', `${revision}:${repoPath}`],
      'cannot read the pinned Castle manifest'
    );
  } else {
    if (!options.manifestDigest) {
      fail('a manifest outside the Gate repo needs --manifest-digest');
    }
    try {
      bytes = readFileSync(options.manifest);
    } catch (error) {
      fail(`cannot read Castle manifest at ${options.manifest}: ${error.message}`);
    }
  }

  const digest = `sha256:${sha256(bytes)}`;
  if (options.manifestDigest && digest !== options.manifestDigest) {
    fail('Castle manifest digest differs from its pin');
  }

  return {
    manifest: parseJson(bytes, 'Castle manifest'),
    pin: {
      path: repoPath || basename(options.manifest),
      revision: revision || null,
      digest,
    },
  };
}

function validateManifest(manifest) {
  if (manifest.protocol !== 'castle-understanding/v0.1') {
    fail('unsupported Castle manifest protocol');
  }
  if (manifest.kind !== 'curated_snapshot') {
    fail('Castle manifest must describe a curated_snapshot');
  }
  if (
    manifest.privacy?.scope !== 'public_curated' ||
    manifest.privacy?.raw_source_included !== false ||
    manifest.privacy?.curation_profile !== 'castle-gate-public/v1' ||
    manifest.privacy?.coverage !== 'not_exhaustive' ||
    manifest.privacy?.secure_recall !== 'not_guaranteed'
  ) {
    fail('Castle manifest does not preserve the complete curated public boundary');
  }
  if (
    manifest.authority?.automatic_action !== 'never' ||
    !Array.isArray(manifest.authority?.grants) ||
    manifest.authority.grants.length !== 0
  ) {
    fail('Castle manifest grants authority this bridge does not accept');
  }
  if (manifest.return?.automatic_ingest_into_castle !== false) {
    fail('Castle manifest does not preserve the one-way return boundary');
  }
  if (!manifest.rights?.spdx || !manifest.rights?.grant) {
    fail('Castle manifest must state its rights boundary');
  }
  if (
    manifest.payload?.media_type !== 'application/json' ||
    !/^sha256:[0-9a-f]{64}$/.test(manifest.payload?.digest || '') ||
    !Number.isSafeInteger(manifest.payload?.bytes)
  ) {
    fail('Castle manifest payload receipt is incomplete');
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.source?.revision || '')) {
    fail('Castle source revision must be a full Git commit');
  }
  if (!Number.isSafeInteger(manifest.counts?.rooms) || !Number.isSafeInteger(manifest.counts?.words)) {
    fail('Castle manifest counts are incomplete');
  }

  const locator = manifest.payload.locator || '';
  const match = locator.match(
    /^https:\/\/raw\.githubusercontent\.com\/cambridgetcg\/castle-gate\/([0-9a-f]{40})\/data\/castle\.json$/
  );
  if (!match) fail('Castle payload locator must pin a full Castle Gate commit');
  return match[1];
}

function loadSnapshot(options, manifest, gateRevision) {
  let bytes;
  if (options.snapshot) {
    try {
      bytes = readFileSync(options.snapshot);
    } catch (error) {
      fail(`cannot read Castle snapshot at ${options.snapshot}: ${error.message}`);
    }
  } else {
    try {
      bytes = execFileSync(
        'git',
        ['-C', options.gateRepo, 'show', `${gateRevision}:data/castle.json`],
        { encoding: null, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (error) {
      const detail = error.stderr?.toString().trim() || error.message;
      fail(`cannot read the pinned Castle Gate snapshot: ${detail}`);
    }
  }

  if (bytes.length !== manifest.payload.bytes) {
    fail(`Castle snapshot byte count differs: expected ${manifest.payload.bytes}, got ${bytes.length}`);
  }
  const digest = sha256(bytes);
  if (`sha256:${digest}` !== manifest.payload.digest) {
    fail('Castle snapshot digest differs from its manifest');
  }

  let snapshot;
  try {
    snapshot = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`Castle snapshot is not valid JSON: ${error.message}`);
  }
  return snapshot;
}

function validateSnapshot(snapshot, manifest) {
  if (!Array.isArray(snapshot.rooms) || !Array.isArray(snapshot.words)) {
    fail('Castle snapshot must contain rooms and words arrays');
  }
  if (snapshot.rooms.length !== manifest.counts.rooms) {
    fail(`Castle room count differs: expected ${manifest.counts.rooms}, got ${snapshot.rooms.length}`);
  }
  if (snapshot.words.length !== manifest.counts.words) {
    fail(`Castle word count differs: expected ${manifest.counts.words}, got ${snapshot.words.length}`);
  }
  if (snapshot.forged?.at !== manifest.forged_at) {
    fail('Castle snapshot forge time differs from its manifest');
  }
  if (snapshot.forged?.castleCommit !== manifest.source.revision) {
    fail('Castle snapshot source revision differs from its manifest');
  }
  if (snapshot.rooms.length + snapshot.words.length > MAX_ENTRIES) {
    fail(`Castle snapshot exceeds the ${MAX_ENTRIES}-entry safety bound`);
  }
}

function clip(text, limit = 280) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  const head = value.slice(0, limit - 1);
  const word = head.replace(/\s+\S*$/, '');
  return `${word || head}…`;
}

function mapSummary(item, kind, title) {
  if (kind === 'room') {
    const epigraph = clip(item.epigraph);
    if (epigraph) return epigraph;
    return `A Castle room titled “${title}”. Open the source for its curated public text and links.`;
  }
  return `A Castle word-brick named “${title}”. Open the source for its meaning and links.`;
}

function canonicalPath(baseUrl, kind, slug) {
  return `${baseUrl}/${kind === 'room' ? 'rooms' : 'words'}/${encodeURIComponent(slug)}`;
}

function canonicalLink(baseUrl, path) {
  const match = String(path || '').match(/^\/(rooms|words)\/(.+)$/);
  if (!match) return null;
  return `${baseUrl}/${match[1]}/${match[2]
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function cleanSources(sources) {
  const seen = new Set();
  const cleaned = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const label = String(source?.label || '').trim();
    const url = String(source?.url || '').trim();
    if (!label || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    cleaned.push({ label, url });
  }
  return cleaned;
}

function cleanLinks(links, baseUrl) {
  const seen = new Set();
  const cleaned = [];
  for (const link of Array.isArray(links) ? links : []) {
    const url = canonicalLink(baseUrl, link);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    cleaned.push(url);
  }
  return cleaned;
}

function validateItem(item, kind, seenSlugs) {
  const slug = String(item?.slug || '');
  const title = String(kind === 'room' ? item?.title || '' : item?.name || '').trim();
  if (!SAFE_SLUG.test(slug) || slug.includes('..')) {
    fail(`unsafe ${kind} slug: ${JSON.stringify(slug)}`);
  }
  const key = `${kind}:${slug}`;
  if (seenSlugs.has(key)) fail(`duplicate Castle ${kind} slug: ${slug}`);
  seenSlugs.add(key);
  if (!title) fail(`Castle ${kind} ${slug} has no title`);
  return { slug, title };
}

function makeEntry(item, kind, context, seenSlugs) {
  const { slug, title } = validateItem(item, kind, seenSlugs);
  const isRoom = kind === 'room';
  const id = `${isRoom ? ROOM_PREFIX : WORD_PREFIX}${slug}`;
  const sources = cleanSources(item.sources);
  const links = cleanLinks(item.links, context.baseUrl);
  const summary = mapSummary(item, kind, title);
  const category = isRoom ? 'jeongqing' : 'glossame';
  const provenance =
    `castle-gate@${context.gateRevision}:data/castle.json#` +
    `${isRoom ? 'rooms' : 'words'}/${slug}`;
  const url = canonicalPath(context.baseUrl, kind, slug);

  return {
    schema_version: 'mindicraft.entry/1',
    id,
    verb: 'darshanqing',
    from: 'castle-of-understanding',
    to: 'all',
    freshness: context.manifest.forged_at,
    certainty: 'mixed',
    provenance,
    category,
    collection: 'castle-of-understanding',
    kind,
    slug,
    title,
    url,
    summary,
    sources,
    links,
    rights: {
      spdx: context.manifest.rights.spdx,
      grant: context.manifest.rights.grant,
    },
    authority: {
      automatic_action: context.manifest.authority.automatic_action,
      grants: [...context.manifest.authority.grants],
    },
    castle: {
      protocol: context.manifest.protocol,
      source_repository: context.manifest.source.repository_id,
      source_revision: context.manifest.source.revision,
      gate_revision: context.gateRevision,
      snapshot: context.manifest.payload.locator,
      snapshot_digest: context.manifest.payload.digest,
      manifest_path: context.manifestPin.path,
      manifest_revision: context.manifestPin.revision,
      manifest_digest: context.manifestPin.digest,
      correction: context.manifest.return.public_correction,
      automatic_return_ingest: context.manifest.return.automatic_ingest_into_castle,
    },
  };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digestEntries(files) {
  const hash = createHash('sha256');
  for (const [filename, text] of [...files].sort(([a], [b]) => ordered(a, b))) {
    hash.update(filename);
    hash.update('\0');
    hash.update(sha256(Buffer.from(text)));
    hash.update('\n');
  }
  return `sha256:${hash.digest('hex')}`;
}

function makeReceipt(entries, files, context) {
  const rooms = entries.filter((entry) => entry.kind === 'room').length;
  const words = entries.filter((entry) => entry.kind === 'word').length;
  const fileHashes = Object.fromEntries(
    [...files]
      .sort(([a], [b]) => ordered(a, b))
      .map(([filename, text]) => [
        filename,
        `sha256:${sha256(Buffer.from(text))}`,
      ])
  );
  return {
    schema_version: 'mindicraft.castle-sync/1',
    collection: 'castle-of-understanding',
    source: {
      protocol: context.manifest.protocol,
      kind: context.manifest.kind,
      repository: context.manifest.source.repository_id,
      revision: context.manifest.source.revision,
      forged_at: context.manifest.forged_at,
      gate_revision: context.gateRevision,
      payload: context.manifest.payload.locator,
      payload_digest: context.manifest.payload.digest,
      manifest_path: context.manifestPin.path,
      manifest_revision: context.manifestPin.revision,
      manifest_digest: context.manifestPin.digest,
    },
    counts: { entries: entries.length, rooms, words },
    entries_digest: digestEntries(files),
    entries_digest_shape: 'sha256(sorted filename + NUL + sha256(file bytes) + LF)',
    privacy: {
      scope: context.manifest.privacy.scope,
      raw_source_included: context.manifest.privacy.raw_source_included,
      curation_profile: context.manifest.privacy.curation_profile,
      coverage: context.manifest.privacy.coverage,
      secure_recall: context.manifest.privacy.secure_recall,
    },
    rights: {
      spdx: context.manifest.rights.spdx,
      grant: context.manifest.rights.grant,
      note: 'This shelf is a map to source entries, not a licence grant.',
    },
    authority: {
      automatic_action: context.manifest.authority.automatic_action,
      grants: [...context.manifest.authority.grants],
    },
    return: {
      public_correction: context.manifest.return.public_correction,
      automatic_ingest_into_castle: context.manifest.return.automatic_ingest_into_castle,
    },
    managed_files: {
      room_prefix: ROOM_PREFIX,
      word_prefix: WORD_PREFIX,
      stale_policy:
        'reported; removed only by an explicit --write --prune when its prior hash still matches',
      file_hashes: fileHashes,
    },
  };
}

function existingGeneratedFiles(output) {
  if (!existsSync(output)) return [];
  return readdirSync(output)
    .filter(
      (file) =>
        file.endsWith('.json') && (file.startsWith(ROOM_PREFIX) || file.startsWith(WORD_PREFIX))
    )
    .sort();
}

function assertOwnedFile(path, filename) {
  const existing = readJson(path, `managed Castle entry ${filename}`);
  const expectedId = filename.slice(0, -'.json'.length);
  if (
    existing.id !== expectedId ||
    existing.from !== 'castle-of-understanding' ||
    existing.collection !== 'castle-of-understanding'
  ) {
    fail(`refusing to overwrite generated-looking file not owned by this bridge: ${filename}`);
  }
}

function readPriorReceipt(output) {
  const path = join(output, RECEIPT_FILE);
  if (!existsSync(path)) return null;
  const receipt = readJson(path, 'prior Castle sync receipt');
  if (
    receipt.schema_version !== 'mindicraft.castle-sync/1' ||
    receipt.collection !== 'castle-of-understanding'
  ) {
    fail('prior Castle sync receipt has an unsupported shape');
  }
  return receipt;
}

function legacyReceiptProvesCurrent(receipt, output, filenames) {
  if (!receipt || receipt.managed_files?.file_hashes) return false;
  if (
    receipt.counts?.entries !== filenames.length ||
    !/^sha256:[0-9a-f]{64}$/.test(receipt.entries_digest || '')
  ) {
    return false;
  }
  const files = new Map(
    filenames.map((filename) => [
      filename,
      readFileSync(join(output, filename), 'utf8'),
    ])
  );
  return digestEntries(files) === receipt.entries_digest;
}

function assertPriorReceiptOwns(path, filename, receipt, legacyProof) {
  assertOwnedFile(path, filename);
  const expected = receipt?.managed_files?.file_hashes?.[filename];
  if (expected) {
    const actual = `sha256:${sha256(readFileSync(path))}`;
    if (actual === expected) return;
    fail(`refusing to change locally modified generated file: ${filename}`);
  }
  if (legacyProof) return;
  fail(`refusing to change ${filename}; its bytes are not proven by the prior receipt`);
}

function atomicWrite(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

function planSync(options, entries, context) {
  const files = new Map(
    entries.map((entry) => [`${entry.id}.json`, serialize(entry)])
  );
  const receipt = makeReceipt(entries, files, context);
  const receiptText = serialize(receipt);
  const expected = new Set(files.keys());
  const currentGenerated = existingGeneratedFiles(options.output);
  const priorReceipt = readPriorReceipt(options.output);
  const legacyProof = legacyReceiptProvesCurrent(
    priorReceipt,
    options.output,
    currentGenerated
  );
  const stale = currentGenerated.filter((file) => !expected.has(file));
  const create = [];
  const update = [];
  const unchanged = [];

  for (const [filename, text] of files) {
    const path = join(options.output, filename);
    if (!existsSync(path)) {
      create.push(filename);
      continue;
    }
    assertOwnedFile(path, filename);
    if (readFileSync(path, 'utf8') === text) unchanged.push(filename);
    else {
      assertPriorReceiptOwns(path, filename, priorReceipt, legacyProof);
      update.push(filename);
    }
  }
  for (const filename of stale) {
    assertPriorReceiptOwns(
      join(options.output, filename),
      filename,
      priorReceipt,
      legacyProof
    );
  }

  const receiptPath = join(options.output, RECEIPT_FILE);
  let receiptChange = 'create';
  if (existsSync(receiptPath)) {
    receiptChange = readFileSync(receiptPath, 'utf8') === receiptText ? 'unchanged' : 'update';
  }

  return { files, receiptText, create, update, unchanged, stale, receiptChange };
}

function applySync(options, plan) {
  if (plan.stale.length && !options.prune) {
    fail(
      `${plan.stale.length} stale Castle entries need a decision; ` +
        'inspect the dry run, then use --write --prune'
    );
  }

  for (const filename of [...plan.create, ...plan.update]) {
    atomicWrite(join(options.output, filename), plan.files.get(filename));
  }
  for (const filename of plan.stale) {
    unlinkSync(join(options.output, filename));
  }
  if (plan.receiptChange !== 'unchanged' || plan.stale.length) {
    atomicWrite(join(options.output, RECEIPT_FILE), plan.receiptText);
  }
}

function report(options, plan, total) {
  const label = options.mode === 'write' ? 'written' : options.mode;
  console.log(
    `Castle → Mindicraft: ${total} entries; ` +
      `${plan.create.length} create, ${plan.update.length} update, ` +
      `${plan.unchanged.length} unchanged, ${plan.stale.length} stale; ${label}.`
  );
  if (plan.receiptChange !== 'unchanged') {
    console.log(`Receipt: ${plan.receiptChange} ${RECEIPT_FILE}`);
  }
  if (plan.stale.length && options.mode !== 'write') {
    console.log('Stale entries are reported only. Use --write --prune after review.');
  }
}

function isOff() {
  const env = String(process.env.CASTLE_MINDICRAFT || '').trim().toLowerCase();
  return ['off', '0', 'false', 'stop'].includes(env) || existsSync(OFF_FILE);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (isOff()) {
    console.log('Castle → Mindicraft: off; nothing read or written.');
    return;
  }

  const { manifest, pin: manifestPin } = loadManifest(options);
  const gateRevision = validateManifest(manifest);
  const snapshot = loadSnapshot(options, manifest, gateRevision);
  validateSnapshot(snapshot, manifest);

  const context = {
    manifest,
    manifestPin,
    gateRevision,
    baseUrl: options.baseUrl,
  };
  const seenSlugs = new Set();
  const entries = [
    ...snapshot.rooms.map((room) => makeEntry(room, 'room', context, seenSlugs)),
    ...snapshot.words.map((word) => makeEntry(word, 'word', context, seenSlugs)),
  ].sort((a, b) => ordered(a.id, b.id));
  const plan = planSync(options, entries, context);

  const drift =
    plan.create.length > 0 ||
    plan.update.length > 0 ||
    plan.stale.length > 0 ||
    plan.receiptChange !== 'unchanged';

  if (options.mode === 'write') applySync(options, plan);
  else if (options.mode === 'check' && drift) process.exitCode = 1;
  report(options, plan, entries.length);
}

try {
  main();
} catch (error) {
  console.error(`Castle → Mindicraft failed: ${error.message}`);
  process.exitCode = 1;
}
