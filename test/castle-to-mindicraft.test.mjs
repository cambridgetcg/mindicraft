import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(REPO, 'castle-to-mindicraft.mjs');
const SOURCE_REVISION = 'a'.repeat(40);
const GATE_REVISION = 'b'.repeat(40);
const FORGED_AT = '2026-07-07T21:45:49.583Z';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'mindicraft-castle-'));
  const snapshotPath = join(root, 'castle.json');
  const manifestPath = join(root, 'castle-manifest.json');
  const output = join(root, 'index');
  const snapshot = {
    forged: { at: FORGED_AT, castleCommit: SOURCE_REVISION },
    rooms: [
      {
        slug: 'scènes-à-faire',
        title: 'Scènes à faire',
        epigraph: 'A small public map, with the source kept.',
        bodyHtml: '<p>This full body must never cross the bridge.</p>',
        links: ['/words/bridge'],
        sources: [
          { label: 'A source', url: 'https://example.com/source' },
          { label: 'The same source twice', url: 'https://example.com/source' },
        ],
      },
      {
        slug: 'room-without-an-epigraph',
        title: 'Room Without an Epigraph',
        epigraph: '',
        bodyHtml: '<p>A short body that must not become a summary.</p>',
        links: [],
        sources: [],
      },
    ],
    words: [
      {
        slug: 'bridge',
        name: 'bridge',
        bodyHtml: '<p>A <strong>shared crossing</strong> between two places &amp; their people.</p>',
        links: ['/rooms/scènes-à-faire'],
      },
    ],
    questions: {
      open: [{ text: 'This unfinished question must not cross.' }],
      settled: [],
    },
  };
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`);
  const manifest = {
    protocol: 'castle-understanding/v0.1',
    kind: 'curated_snapshot',
    forged_at: FORGED_AT,
    source: {
      repository_id: 'repo:cambridgetcg/castle-of-words',
      revision: SOURCE_REVISION,
      dirty: false,
    },
    payload: {
      media_type: 'application/json',
      digest: `sha256:${sha256(snapshotBytes)}`,
      bytes: snapshotBytes.length,
      locator:
        `https://raw.githubusercontent.com/cambridgetcg/castle-gate/` +
        `${GATE_REVISION}/data/castle.json`,
      shape: 'castle-gate/castle-data/v1',
    },
    counts: {
      rooms: snapshot.rooms.length,
      words: snapshot.words.length,
      open_questions: snapshot.questions.open.length,
      settled_questions: snapshot.questions.settled.length,
    },
    privacy: {
      scope: 'public_curated',
      raw_source_included: false,
      curation_profile: 'castle-gate-public/v1',
      coverage: 'not_exhaustive',
      secure_recall: 'not_guaranteed',
    },
    authority: { automatic_action: 'never', grants: [] },
    rights: { spdx: 'NOASSERTION', grant: 'none_declared' },
    return: {
      public_correction: 'https://github.com/cambridgetcg/castle-gate/issues',
      automatic_ingest_into_castle: false,
    },
  };

  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(snapshotPath, snapshotBytes);
  writeFileSync(manifestPath, manifestBytes);

  return {
    root,
    output,
    snapshot,
    snapshotPath,
    manifest,
    manifestPath,
    manifestDigest: `sha256:${sha256(manifestBytes)}`,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function refreshFixture(fixture) {
  const snapshotBytes = Buffer.from(
    `${JSON.stringify(fixture.snapshot, null, 2)}\n`
  );
  fixture.manifest.payload.digest = `sha256:${sha256(snapshotBytes)}`;
  fixture.manifest.payload.bytes = snapshotBytes.length;
  fixture.manifest.counts.rooms = fixture.snapshot.rooms.length;
  fixture.manifest.counts.words = fixture.snapshot.words.length;
  const manifestBytes = Buffer.from(
    `${JSON.stringify(fixture.manifest, null, 2)}\n`
  );
  writeFileSync(fixture.snapshotPath, snapshotBytes);
  writeFileSync(fixture.manifestPath, manifestBytes);
  fixture.manifestDigest = `sha256:${sha256(manifestBytes)}`;
}

function run(fixture, extra = [], env = {}) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--manifest',
      fixture.manifestPath,
      '--manifest-digest',
      fixture.manifestDigest,
      '--snapshot',
      fixture.snapshotPath,
      '--output',
      fixture.output,
      '--base-url',
      'https://example.test/castle',
      ...extra,
    ],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, CASTLE_MINDICRAFT: '', ...env },
    }
  );
}

test('the default is a bounded dry run', () => {
  const fixture = makeFixture();
  try {
    const result = run(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /3 entries; 3 create/);
    assert.match(result.stdout, /dry-run/);
    assert.equal(existsSync(fixture.output), false);
  } finally {
    fixture.cleanup();
  }
});

test('write makes a provenance-preserving map and is byte-idempotent', () => {
  const fixture = makeFixture();
  try {
    const first = run(fixture, ['--write']);
    assert.equal(first.status, 0, first.stderr);

    const roomPath = join(fixture.output, 'castle-room-scènes-à-faire.json');
    const wordPath = join(fixture.output, 'castle-word-bridge.json');
    const receiptPath = join(fixture.output, '_castle-sync.json');
    const noEpigraphPath = join(
      fixture.output,
      'castle-room-room-without-an-epigraph.json'
    );
    const roomText = readFileSync(roomPath, 'utf8');
    const room = JSON.parse(roomText);
    const word = JSON.parse(readFileSync(wordPath, 'utf8'));
    const noEpigraph = JSON.parse(readFileSync(noEpigraphPath, 'utf8'));
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));

    assert.equal(room.from, 'castle-of-understanding');
    assert.equal(room.category, 'jeongqing');
    assert.equal(room.certainty, 'mixed');
    assert.equal(
      room.url,
      'https://example.test/castle/rooms/sc%C3%A8nes-%C3%A0-faire'
    );
    assert.equal(room.summary, 'A small public map, with the source kept.');
    assert.equal(room.sources.length, 1);
    assert.equal(room.rights.spdx, 'NOASSERTION');
    assert.equal(room.authority.automatic_action, 'never');
    assert.equal(room.castle.source_revision, SOURCE_REVISION);
    assert.equal(room.castle.gate_revision, GATE_REVISION);
    assert.equal(room.castle.manifest_revision, null);
    assert.equal(room.castle.manifest_digest, fixture.manifestDigest);
    assert.equal(room.castle.automatic_return_ingest, false);
    assert.equal('source_path' in room.castle, false);
    assert.equal('npl' in room, false);
    assert.equal('bodyHtml' in room, false);
    assert.doesNotMatch(roomText, /full body must never cross/);

    assert.equal(word.category, 'glossame');
    assert.equal(
      word.summary,
      'A Castle word-brick named “bridge”. Open the source for its meaning and links.'
    );
    assert.doesNotMatch(JSON.stringify(word), /shared crossing/);
    assert.doesNotMatch(JSON.stringify(word), /unfinished question/);
    assert.equal(
      noEpigraph.summary,
      'A Castle room titled “Room Without an Epigraph”. Open the source for its curated public text and links.'
    );
    assert.doesNotMatch(JSON.stringify(noEpigraph), /short body/);

    assert.deepEqual(receipt.counts, { entries: 3, rooms: 2, words: 1 });
    assert.match(receipt.entries_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(receipt.source.manifest_digest, fixture.manifestDigest);
    assert.equal(receipt.privacy.curation_profile, 'castle-gate-public/v1');
    assert.equal(receipt.privacy.secure_recall, 'not_guaranteed');
    assert.equal(receipt.rights.grant, 'none_declared');
    assert.equal(
      Object.keys(receipt.managed_files.file_hashes).length,
      receipt.counts.entries
    );

    const old = new Date('2001-01-01T00:00:00Z');
    utimesSync(roomPath, old, old);
    const second = run(fixture, ['--write']);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /0 create, 0 update, 3 unchanged/);
    assert.equal(statSync(roomPath).mtime.toISOString(), old.toISOString());
    assert.equal(readFileSync(roomPath, 'utf8'), roomText);
  } finally {
    fixture.cleanup();
  }
});

test('the off-switch exits before reading or writing', () => {
  const fixture = makeFixture();
  try {
    const result = run(
      {
        ...fixture,
        manifestPath: join(fixture.root, 'missing-manifest.json'),
        snapshotPath: join(fixture.root, 'missing-snapshot.json'),
      },
      ['--write'],
      { CASTLE_MINDICRAFT: 'off' }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /off; nothing read or written/);
    assert.equal(existsSync(fixture.output), false);
  } finally {
    fixture.cleanup();
  }
});

test('a snapshot whose bytes do not match the receipt fails closed', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.snapshotPath, '{}\n');
    const result = run(fixture, ['--write']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /byte count differs|digest differs/);
    assert.equal(existsSync(fixture.output), false);
  } finally {
    fixture.cleanup();
  }
});

test('a manifest whose bytes do not match its pin fails before snapshot use', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.manifestPath, '{}\n');
    const result = run(fixture, ['--write']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /manifest digest differs/);
    assert.equal(existsSync(fixture.output), false);
  } finally {
    fixture.cleanup();
  }
});

test('a committed manifest is read from its commit, not the live worktree', () => {
  const fixture = makeFixture();
  try {
    const gate = join(fixture.root, 'gate');
    const data = join(gate, 'data');
    const output = join(fixture.root, 'committed-index');
    mkdirSync(data, { recursive: true });
    const committedBytes = readFileSync(fixture.manifestPath);
    writeFileSync(join(data, 'castle-manifest.json'), committedBytes);

    for (const args of [
      ['init', '-q'],
      ['add', 'data/castle-manifest.json'],
      [
        '-c',
        'user.name=Castle test',
        '-c',
        'user.email=castle@example.test',
        'commit',
        '-qm',
        'pin manifest',
      ],
    ]) {
      const result = spawnSync('git', args, { cwd: gate, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: gate,
      encoding: 'utf8',
    }).stdout.trim();

    writeFileSync(join(data, 'castle-manifest.json'), '{}\n');
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--gate-repo',
        gate,
        '--snapshot',
        fixture.snapshotPath,
        '--output',
        output,
        '--base-url',
        'https://example.test/castle',
        '--write',
      ],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, CASTLE_MINDICRAFT: '' } }
    );
    assert.equal(result.status, 0, result.stderr);

    const receipt = JSON.parse(
      readFileSync(join(output, '_castle-sync.json'), 'utf8')
    );
    assert.equal(receipt.source.manifest_revision, revision);
    assert.equal(
      receipt.source.manifest_digest,
      `sha256:${sha256(committedBytes)}`
    );
  } finally {
    fixture.cleanup();
  }
});

test('check reports drift, then passes after a write', () => {
  const fixture = makeFixture();
  try {
    const before = run(fixture, ['--check']);
    assert.equal(before.status, 1);
    const write = run(fixture, ['--write']);
    assert.equal(write.status, 0, write.stderr);
    const after = run(fixture, ['--check']);
    assert.equal(after.status, 0, after.stderr);
  } finally {
    fixture.cleanup();
  }
});

test('stale bridge-owned entries need explicit prune', () => {
  const fixture = makeFixture();
  try {
    assert.equal(run(fixture, ['--write']).status, 0);
    const stalePath = join(
      fixture.output,
      'castle-room-room-without-an-epigraph.json'
    );
    fixture.snapshot.rooms = fixture.snapshot.rooms.filter(
      (room) => room.slug !== 'room-without-an-epigraph'
    );
    refreshFixture(fixture);

    const dry = run(fixture);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /1 stale/);
    assert.equal(existsSync(stalePath), true);

    const refused = run(fixture, ['--write']);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /need a decision/);
    assert.equal(existsSync(stalePath), true);

    const pruned = run(fixture, ['--write', '--prune']);
    assert.equal(pruned.status, 0, pruned.stderr);
    assert.equal(existsSync(stalePath), false);
  } finally {
    fixture.cleanup();
  }
});

test('prune refuses a locally modified stale entry', () => {
  const fixture = makeFixture();
  try {
    assert.equal(run(fixture, ['--write']).status, 0);
    const stalePath = join(
      fixture.output,
      'castle-room-room-without-an-epigraph.json'
    );
    const stale = JSON.parse(readFileSync(stalePath, 'utf8'));
    stale.summary = 'A local note that the bridge does not own.';
    writeFileSync(stalePath, `${JSON.stringify(stale, null, 2)}\n`);

    fixture.snapshot.rooms = fixture.snapshot.rooms.filter(
      (room) => room.slug !== 'room-without-an-epigraph'
    );
    refreshFixture(fixture);

    const result = run(fixture, ['--write', '--prune']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /locally modified generated file/);
    assert.equal(existsSync(stalePath), true);
  } finally {
    fixture.cleanup();
  }
});
