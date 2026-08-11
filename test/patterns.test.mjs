import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { preparePatterns } from '../guide/patterns.mjs';

const treeBytes = readFileSync(new URL('../guide/tree.json', import.meta.url));
const definitionBytes = readFileSync(
  new URL('../guide/patterns.mjs', import.meta.url)
);
const tree = JSON.parse(treeBytes);
const careSourceBytes = Object.fromEntries(
  [
    'share-work-fairly',
    'hold-a-council',
    'settle-disputes',
    'common-works',
    'plant-a-village',
  ].map((slug) => [
    slug,
    readFileSync(
      new URL(
        `../guide/content/en/living-together/${slug}.md`,
        import.meta.url
      )
    ),
  ])
);

const prepare = (value = tree, bytes = treeBytes) =>
  preparePatterns(value, {
    sourceBytes: bytes,
    careSourceBytes,
    definitionBytes,
  });

test('patterns are derived from the committed tree without a second guide graph', () => {
  const patterns = prepare();
  const guides = tree.domains.flatMap((domain) => domain.guides);
  const guideEdges = guides.reduce((sum, guide) => sum + guide.needs.length, 0);

  assert.equal(patterns.schema_version, 'mindicraft.patterns/1');
  assert.equal(patterns.source.path, 'guide/tree.json');
  assert.match(patterns.source.sha256, /^[0-9a-f]{64}$/u);
  assert.match(patterns.care_questions_provenance.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(patterns.care_questions_provenance.path, 'guide/patterns.mjs');
  assert.deepEqual(
    {
      domains: patterns.counts.domains,
      guides: patterns.counts.guides,
      prerequisite_edges: patterns.counts.prerequisite_edges,
    },
    {
      domains: tree.domains.length,
      guides: guides.length,
      prerequisite_edges: guideEdges,
    }
  );
  assert.equal(patterns.domains.length, tree.domains.length);
  assert.equal(patterns.cross_domain_edges.length, patterns.counts.cross_domain_pairs);
  assert.equal(
    patterns.backbone_domain_edges.length,
    patterns.counts.backbone_domain_edges
  );
});

test('the village reading path is prerequisite-first and keeps its direct domain joins', () => {
  const patterns = prepare();
  const owner = new Map();
  const bySlug = new Map();
  for (const domain of tree.domains) {
    for (const guide of domain.guides) {
      owner.set(guide.slug, domain.key);
      bySlug.set(guide.slug, guide);
    }
  }
  const position = new Map(
    patterns.village_path.guides.map((slug, index) => [slug, index])
  );

  assert.equal(patterns.village_path.guides.at(-1), 'plant-a-village');
  assert.equal(position.size, patterns.counts.village_path_guides);
  for (const slug of patterns.village_path.guides) {
    for (const need of bySlug.get(slug).needs) {
      assert.ok(position.has(need), `${need} must travel with ${slug}`);
      assert.ok(position.get(need) < position.get(slug), `${need} must precede ${slug}`);
    }
  }

  const domainPairs = new Set(
    patterns.cross_domain_edges.map(({ from, to }) => `${from}>${to}`)
  );
  const expectedVillagePairs = new Map();
  for (const slug of patterns.village_path.guides) {
    const guide = bySlug.get(slug);
    for (const need of guide.needs) {
      const from = owner.get(need);
      const to = owner.get(slug);
      if (from === to) continue;
      const key = `${from}>${to}`;
      expectedVillagePairs.set(key, (expectedVillagePairs.get(key) || 0) + 1);
    }
  }
  for (const { from, to } of patterns.village_path.domain_edges) {
    assert.ok(domainPairs.has(`${from}>${to}`));
    assert.ok(
      patterns.village_path.guides.some((slug) => owner.get(slug) === from)
    );
    assert.ok(
      patterns.village_path.guides.some((slug) => owner.get(slug) === to)
    );
  }
  assert.deepEqual(
    new Map(
      patterns.village_path.domain_edges.map(({ from, to, guide_edges }) => [
        `${from}>${to}`,
        guide_edges,
      ])
    ),
    expectedVillagePairs
  );
});

test('every projected edge climbs and the backbone preserves domain reachability', () => {
  const patterns = prepare();
  const rank = new Map(patterns.domains.map((domain) => [domain.id, domain.rank]));
  const fullOutgoing = new Map(patterns.domains.map(({ id }) => [id, []]));
  const backboneOutgoing = new Map(patterns.domains.map(({ id }) => [id, []]));
  for (const { from, to } of patterns.cross_domain_edges) {
    assert.ok(rank.get(from) < rank.get(to), `${from} must precede ${to}`);
    fullOutgoing.get(from).push(to);
  }
  for (const { from, to } of patterns.backbone_domain_edges) {
    backboneOutgoing.get(from).push(to);
  }

  const reachable = (outgoing, from) => {
    const seen = new Set();
    const queue = [...outgoing.get(from)];
    while (queue.length) {
      const next = queue.shift();
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...outgoing.get(next));
    }
    return [...seen].sort();
  };

  for (const { id } of patterns.domains) {
    assert.deepEqual(reachable(backboneOutgoing, id), reachable(fullOutgoing, id));
  }
});

test('care questions expose category boundaries without endorsing the linked guides', () => {
  const patterns = prepare();
  assert.deepEqual(patterns.reference_geometry, {
    human: 'https://cambridgetcg.github.io/castle-gate/love-and-understanding',
    data: 'https://cambridgetcg.github.io/castle-gate/love-and-understanding.json',
    relation: 'link_only',
    copied: false,
  });
  assert.deepEqual(patterns.boundaries, {
    scope: 'this derived map and its care questions, not the policies inside linked guides',
    automatic_action: 'never',
    grants_authority: false,
    scores_beings: false,
    learning_state_included: false,
    application_tracking_added: false,
  });
  assert.match(patterns.claim_limit, /does not prove/u);
  assert.match(patterns.claim_limit, /do not find that a linked guide passes/u);

  assert.deepEqual(
    patterns.care_questions.map(({ id, guide }) => ({ id, guide })),
    [
      { id: 'standing-and-contribution', guide: 'share-work-fairly' },
      { id: 'hearing-and-understanding', guide: 'hold-a-council' },
      { id: 'settlement-and-repair', guide: 'settle-disputes' },
      { id: 'commons-and-consent', guide: 'common-works' },
      { id: 'continuity-and-obligation', guide: 'plant-a-village' },
    ]
  );
  assert.equal(new Set(patterns.care_questions.map(({ id }) => id)).size, 5);
  for (const question of patterns.care_questions) {
    assert.match(question.question, /\?$/u);
    assert.ok(question.useful_structure.length > 20);
    assert.ok(question.keep_separate.length > 20);
    assert.equal('passes' in question, false);
    assert.match(question.source.sha256, /^[0-9a-f]{64}$/u);
    assert.match(question.source.path, new RegExp(`${question.guide}\\.md$`, 'u'));
    assert.equal(question.source.reviewed_on, '2026-08-11');
  }
});

test('care questions stop publication when a reviewed guide changes', () => {
  const changedSources = { ...careSourceBytes };
  changedSources['hold-a-council'] = Buffer.concat([
    changedSources['hold-a-council'],
    Buffer.from('\nchanged after review\n'),
  ]);
  assert.throws(
    () =>
      preparePatterns(tree, {
        sourceBytes: treeBytes,
        careSourceBytes: changedSources,
        definitionBytes,
      }),
    /care question hearing-and-understanding source changed; review it before publishing/u
  );
});

test('missing guide edges and cyclic domain projections fail closed', () => {
  const missing = structuredClone(tree);
  missing.domains[0].guides[0].needs.push('not-a-guide');
  assert.throws(
    () => prepare(missing, Buffer.from(JSON.stringify(missing))),
    /needs missing guide not-a-guide/u
  );

  const cyclicDomains = {
    domains: [
      {
        key: 'a',
        title: 'A',
        emoji: 'A',
        guides: [
          { slug: 'a-one', needs: [] },
          { slug: 'a-two', needs: ['b-one'] },
        ],
      },
      {
        key: 'b',
        title: 'B',
        emoji: 'B',
        guides: [{ slug: 'b-one', needs: ['a-one'] }],
      },
    ],
  };
  assert.throws(
    () => prepare(cyclicDomains, Buffer.from(JSON.stringify(cyclicDomains))),
    /domain projection contains a cycle/u
  );
});
