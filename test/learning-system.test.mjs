import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LEARNING_RANK_THRESHOLDS,
  LEARNING_STATE_SCHEMA_VERSION,
  LEARNING_SYSTEM,
  LEARNING_XP_WEIGHTS,
  addLearnedGuide,
  createLearningEngine,
  createLearningState,
  exportLearningState,
  goalPrerequisitePath,
  importLearningState,
  learningRank,
  learningSnapshot,
  levelForXp,
  readyGuides,
  setLearningGoal,
  validateLearningState,
  xpThresholdForLevel,
} from '../guide/learning-system.mjs';

const canonicalTree = JSON.parse(
  readFileSync(new URL('../guide/tree.json', import.meta.url))
);

const tree = {
  domains: [
    {
      key: 'one',
      title: 'One',
      guides: [
        {
          slug: 'root',
          title: 'Root',
          difficulty: 'easy',
          needs: [],
        },
        {
          slug: 'branch',
          title: 'Branch',
          difficulty: 'steady',
          needs: ['root'],
        },
        {
          slug: 'crown',
          title: 'Crown',
          difficulty: 'hard',
          needs: ['branch'],
        },
      ],
    },
    {
      key: 'two',
      title: 'Two',
      guides: [
        {
          slug: 'deep-work',
          title: 'Deep work',
          difficulty: 'mastery',
          needs: [],
        },
      ],
    },
    {
      key: 'three',
      title: 'Three',
      guides: [
        {
          slug: 'third-door',
          title: 'Third door',
          difficulty: 'easy',
          needs: [],
        },
      ],
    },
  ],
};

const state = (goal = null, learned = []) => ({
  schema_version: 'mindicraft.learning-state/1',
  goal,
  learned,
});

test('the frozen public definition states the source, lineage, arithmetic, and limits', () => {
  assert.equal(LEARNING_SYSTEM.schema_version, 'mindicraft.learning-system/1');
  assert.equal(LEARNING_STATE_SCHEMA_VERSION, 'mindicraft.learning-state/1');
  assert.deepEqual(LEARNING_XP_WEIGHTS, {
    easy: 10,
    steady: 15,
    hard: 25,
    mastery: 40,
  });
  assert.deepEqual(
    LEARNING_RANK_THRESHOLDS.map(({ rank, learned }) => [rank, learned]),
    [
      ['E', 0],
      ['D', 1],
      ['C', 5],
      ['B', 15],
      ['A', 35],
      ['S', 70],
    ]
  );
  assert.deepEqual(LEARNING_SYSTEM.state_schema.exact_fields, [
    'schema_version',
    'goal',
    'learned',
  ]);
  assert.deepEqual(LEARNING_SYSTEM.boundaries.state_excludes, [
    'timestamps',
    'identity',
    'streaks',
    'decay',
  ]);
  assert.deepEqual(LEARNING_SYSTEM.boundaries.rank_is_not_a_measure_of, [
    'human worth',
    'trust',
    'intelligence',
    'competence',
    'mastery',
  ]);
  assert.equal(LEARNING_SYSTEM.boundaries.xenia_no_scoreboard_satisfied, false);
  assert.ok(LEARNING_SYSTEM.source_notes.some((note) => note.includes('tree.json')));
  assert.ok(LEARNING_SYSTEM.lineage_notes.some((note) => note.lineage.includes('XENIA')));
  assert.ok(Object.isFrozen(LEARNING_SYSTEM));
  assert.ok(Object.isFrozen(LEARNING_SYSTEM.achievements[0]));
});

test('state is exactly three bounded fields with known, unique slugs', () => {
  assert.deepEqual(createLearningState(tree), state());
  assert.deepEqual(createLearningState(tree, 'crown'), state('crown'));

  assert.throws(
    () => validateLearningState({ ...state(), streak: 7 }, tree),
    /exactly schema_version, goal, learned/
  );
  assert.throws(
    () => validateLearningState({ goal: null, learned: [] }, tree),
    /exactly schema_version, goal, learned/
  );
  assert.throws(
    () => validateLearningState({ ...state(), schema_version: 'later' }, tree),
    /mindicraft.learning-state\/1/
  );
  assert.throws(
    () => validateLearningState(state('missing'), tree),
    /unknown guide missing/
  );
  assert.throws(
    () => validateLearningState(state(null, ['missing']), tree),
    /unknown guide missing/
  );
  assert.throws(
    () => validateLearningState(state(null, ['root', 'root']), tree),
    /duplicate root/
  );
});

test('XP, triangular levels, and local learning ranks have exact boundaries', () => {
  assert.equal(xpThresholdForLevel(1), 0);
  assert.equal(xpThresholdForLevel(2), 50);
  assert.equal(xpThresholdForLevel(3), 150);
  assert.equal(xpThresholdForLevel(4), 300);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(49), 1);
  assert.equal(levelForXp(50), 2);
  assert.equal(levelForXp(149), 2);
  assert.equal(levelForXp(150), 3);
  assert.throws(() => xpThresholdForLevel(0), /level must be/);
  assert.throws(() => levelForXp(-1), /non-negative/);

  for (const [count, rank] of [
    [0, 'E'],
    [1, 'D'],
    [4, 'D'],
    [5, 'C'],
    [15, 'B'],
    [35, 'A'],
    [70, 'S'],
    [134, 'S'],
  ]) {
    const result = learningRank(count);
    assert.equal(result.rank, rank);
    assert.deepEqual(result.not_a_measure_of, [
      'human worth',
      'trust',
      'intelligence',
      'competence',
      'mastery',
    ]);
  }
});

test('a goal produces a prerequisite-first path and one next unmet quest', () => {
  assert.deepEqual(goalPrerequisitePath(tree, 'crown'), ['root', 'branch', 'crown']);
  const chosen = setLearningGoal(tree, state(null, ['root']), 'crown');
  const view = learningSnapshot(tree, chosen);

  assert.deepEqual(
    view.goal.path.map(({ slug, learned }) => [slug, learned]),
    [
      ['root', true],
      ['branch', false],
      ['crown', false],
    ]
  );
  assert.equal(view.goal.next_unmet_quest.slug, 'branch');
  assert.equal(view.goal.complete, false);
  assert.equal(
    learningSnapshot(tree, state('crown', ['root', 'branch', 'crown'])).goal.complete,
    true
  );
  assert.equal(learningSnapshot(tree, state()).goal, null);
});

test('ARISE contains every unlearned guide whose direct needs are learned', () => {
  assert.deepEqual(
    readyGuides(tree, state()).map(({ slug, status }) => [slug, status]),
    [
      ['root', 'ARISE'],
      ['deep-work', 'ARISE'],
      ['third-door', 'ARISE'],
    ]
  );
  assert.deepEqual(
    readyGuides(tree, state(null, ['root'])).map(({ slug }) => slug),
    ['branch', 'deep-work', 'third-door']
  );
});

test('snapshots count domains and unlock finite achievements', () => {
  const view = learningSnapshot(
    tree,
    state(null, ['root', 'branch', 'deep-work', 'third-door'])
  );
  assert.deepEqual(
    view.domains.map(({ key, learned, total }) => [key, learned, total]),
    [
      ['one', 2, 3],
      ['two', 1, 1],
      ['three', 1, 1],
    ]
  );
  assert.deepEqual(
    view.achievements.filter(({ earned }) => earned).map(({ id }) => id),
    ['first-guide', 'three-domains', 'dependency-chain']
  );
  assert.equal(view.xp.total, 75);
  assert.equal(view.xp.level, 2);

  const seventeen = {
    domains: Array.from({ length: 17 }, (_, index) => ({
      key: `domain-${index + 1}`,
      title: `Domain ${index + 1}`,
      guides: [
        {
          slug: `guide-${index + 1}`,
          title: `Guide ${index + 1}`,
          difficulty: 'easy',
          needs: [],
        },
      ],
    })),
  };
  const everyGuide = Array.from({ length: 17 }, (_, index) => `guide-${index + 1}`);
  assert.equal(
    learningSnapshot(seventeen, state(null, everyGuide)).achievements.find(
      ({ id }) => id === 'all-17-domains'
    ).earned,
    true
  );
});

test('new learning receives an itemized before/award/after receipt once', () => {
  const first = addLearnedGuide(tree, state('crown'), 'root');
  assert.deepEqual(first.state, state('crown', ['root']));
  assert.equal(first.receipt.duplicate, false);
  assert.deepEqual(first.receipt.before, {
    learned_count: 0,
    xp: 0,
    level: 1,
    learning_rank: 'E',
    learned_domains: 0,
    achievements: [],
  });
  assert.deepEqual(first.receipt.award.items, [
    { kind: 'guide-study-mark', slug: 'root', difficulty: 'easy', xp: 10 },
  ]);
  assert.equal(first.receipt.award.total_xp, 10);
  assert.deepEqual(first.receipt.award.achievements_unlocked, [
    { id: 'first-guide', title: 'First study' },
  ]);
  assert.equal(first.receipt.after.xp, 10);
  assert.equal(first.receipt.after.learning_rank, 'D');

  const duplicate = addLearnedGuide(tree, first.state, 'root');
  assert.deepEqual(duplicate.state, first.state);
  assert.equal(duplicate.receipt.duplicate, true);
  assert.deepEqual(duplicate.receipt.award.items, [
    { kind: 'duplicate', slug: 'root', xp: 0 },
  ]);
  assert.equal(duplicate.receipt.award.total_xp, 0);
  assert.deepEqual(duplicate.receipt.before, duplicate.receipt.after);
  assert.deepEqual(duplicate.receipt.award.achievements_unlocked, []);
});

test('state export is canonical and import is exact, strict, and bounded', () => {
  const unordered = state('crown', ['third-door', 'root']);
  const serialized = exportLearningState(unordered, tree);
  assert.equal(
    serialized,
    '{"schema_version":"mindicraft.learning-state/1","goal":"crown","learned":["root","third-door"]}'
  );
  assert.deepEqual(importLearningState(serialized, tree), state('crown', ['root', 'third-door']));
  assert.throws(() => importLearningState('{', tree), /valid JSON/);
  assert.throws(
    () => importLearningState('{"schema_version":"mindicraft.learning-state/1","goal":null,"learned":[],"identity":"me"}', tree),
    /exactly schema_version, goal, learned/
  );
  assert.throws(() => importLearningState(' '.repeat(32_769), tree), /1-32768/);
});

test('the bound engine provides the same pure operations without changing input', () => {
  const engine = createLearningEngine(tree);
  const initial = engine.createState('crown');
  const before = structuredClone(initial);
  const added = engine.add(initial, 'root');

  assert.deepEqual(initial, before);
  assert.deepEqual(added.state.learned, ['root']);
  assert.deepEqual(engine.goalPath('crown'), ['root', 'branch', 'crown']);
  assert.deepEqual(engine.importState(engine.exportState(added.state)), added.state);
  assert.equal(engine.snapshot(added.state).ready.call, 'ARISE');
});

test('malformed, oversized, and cyclic trees fail closed', () => {
  const missing = structuredClone(tree);
  missing.domains[0].guides[1].needs = ['not-here'];
  assert.throws(() => createLearningEngine(missing), /needs unknown guide not-here/);

  const cycle = structuredClone(tree);
  cycle.domains[0].guides[0].needs = ['crown'];
  assert.throws(() => createLearningEngine(cycle), /prerequisite cycle/);

  const difficulty = structuredClone(tree);
  difficulty.domains[0].guides[0].difficulty = 'impossible';
  assert.throws(() => createLearningEngine(difficulty), /difficulty must be/);

  const oversized = {
    domains: Array.from({ length: 65 }, (_, index) => ({
      key: `domain-${index + 1}`,
      title: 'Domain',
      guides: [
        {
          slug: `guide-${index + 1}`,
          title: 'Guide',
          difficulty: 'easy',
          needs: [],
        },
      ],
    })),
  };
  assert.throws(() => createLearningEngine(oversized), /1-64 items/);
});

test('the canonical 17-domain tree is accepted as one deterministic lens', () => {
  const engine = createLearningEngine(canonicalTree);
  const first = engine.snapshot(engine.createState());
  const second = engine.snapshot(engine.createState());
  assert.deepEqual(first, second);
  assert.equal(first.domains.length, 17);
  assert.equal(first.learned_count, 0);
  assert.ok(first.ready.guides.length > 0);
});
