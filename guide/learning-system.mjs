// A private learning lens over guide/tree.json.
//
// This module owns no storage and performs no I/O. The caller decides where a
// state lives. The public definition below describes the rules; personal state
// remains a three-field, local value.

const STATE_SCHEMA_VERSION = 'mindicraft.learning-state/1';
const SYSTEM_SCHEMA_VERSION = 'mindicraft.learning-system/1';
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATE_FIELDS = ['schema_version', 'goal', 'learned'];
const LIMITS = Object.freeze({
  domains: 64,
  guides: 512,
  guides_per_domain: 128,
  needs_per_guide: 16,
  slug_characters: 80,
  title_characters: 180,
  serialized_state_characters: 32_768,
});
const XP = Object.freeze({ easy: 10, steady: 15, hard: 25, mastery: 40 });
const RANKS = Object.freeze([
  Object.freeze({ rank: 'E', learned: 0 }),
  Object.freeze({ rank: 'D', learned: 1 }),
  Object.freeze({ rank: 'C', learned: 5 }),
  Object.freeze({ rank: 'B', learned: 15 }),
  Object.freeze({ rank: 'A', learned: 35 }),
  Object.freeze({ rank: 'S', learned: 70 }),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Frozen, JSON-safe rules for the generated public learning-system endpoint.
 * It contains no personal progress.
 */
export const LEARNING_SYSTEM = deepFreeze({
  schema_version: SYSTEM_SCHEMA_VERSION,
  source_notes: [
    'guide/tree.json is the canonical source of guide slugs, domains, difficulty, and prerequisite edges.',
    'The engine is a pure local projection over that tree. It has no storage, browser, account, identity, or network access.',
    'The public learning-system endpoint may publish these rules, but never a learner state.',
    'The stored field name learned is a compact version-1 name for an explicit self-attested study mark; it does not assert verified learning or mastery.',
  ],
  lineage_notes: [
    {
      lineage: 'XENIA Surface 0.1',
      role: 'XENIA supplies the hospitable, agent-readable front door, local ownership, legible receipts, and costless exit. It does not supply or endorse the E-S and XP display, which is a separate private adaptation and does not satisfy XENIA No-Scoreboard.',
      source: 'https://sinovai.com/xenia',
    },
    {
      lineage: 'AgentTool System',
      role: 'The lens shape, separate rank and XP, triangular level curve, itemized activity, and ARISE honesty are adapted from the current AgentTool System model. Unlike AgentTool events, Mindicraft study marks are explicit game state created by the learner; they are not equivalent to underlying deeds. Mindicraft imports no bearer, trust score, identity, or server state.',
      source: 'https://github.com/cambridgetcg/agenttool/blob/main/api/src/services/system/level.ts',
    },
    {
      lineage: 'Solo Leveling vocabulary',
      role: 'E through S and ARISE are a light thematic nod requested by Mindicraft. No story, character, art, or claim of affiliation is imported.',
      source: null,
    },
    {
      lineage: 'Mindicraft learning lens',
      role: 'Goals, prerequisite quests, XP arithmetic, receipts, and achievements are small local mechanics derived only from the Mindicraft guide tree.',
      source: 'guide/tree.json',
    },
  ],
  rank_thresholds: RANKS.map(({ rank, learned }) => ({ rank, learned })),
  xp_weights: { ...XP },
  level_curve: {
    first_level: 1,
    formula: '50 * n * (n - 1) / 2',
    meaning: 'minimum total XP required to reach level n',
  },
  state_schema: {
    schema_version: STATE_SCHEMA_VERSION,
    exact_fields: [...STATE_FIELDS],
    goal: 'null or one known guide slug',
    learned: 'legacy version-1 field name: unique known guide slugs carrying an explicit self-attested study mark',
    engine_guide_capacity: LIMITS.guides,
    max_serialized_characters: LIMITS.serialized_state_characters,
  },
  boundaries: {
    state_is_private: true,
    state_is_caller_owned: true,
    state_excludes: ['timestamps', 'identity', 'streaks', 'decay'],
    rank_means: 'distinct guides carrying explicit self-attested study marks',
    rank_is_not_a_measure_of: [
      'human worth',
      'trust',
      'intelligence',
      'competence',
      'mastery',
    ],
    xenia_no_scoreboard_satisfied: false,
    private_score_display_is_a_solo_inspired_adaptation: true,
    xp_has_no_cash_value: true,
    no_account_gate: true,
    no_telemetry: true,
    no_leaderboard: true,
    no_streak: true,
    no_decay_or_penalty_for_rest: true,
    no_content_gate: true,
    no_server_sync: true,
    progress_is_self_attested: true,
    difficulty_xp_means_reading_load_not_permission_to_perform: true,
    remedies_and_healing_arts_award_no_treatment_action_xp: true,
  },
  achievements: [
    {
      id: 'first-guide',
      title: 'First study',
      rule: 'Record one distinct self-attested guide study.',
    },
    {
      id: 'three-domains',
      title: 'Three domains',
      rule: 'Record at least one guide study in three distinct domains.',
    },
    {
      id: 'dependency-chain',
      title: 'One studied dependency chain',
      rule: 'Record a guide study and every prerequisite study behind it.',
    },
    {
      id: 'all-17-domains',
      title: 'All 17 domains',
      rule: 'Record at least one guide study in every domain of the canonical 17-domain Mindicraft tree.',
    },
  ],
});

function fail(message) {
  throw new Error(`learning system: ${message}`);
}

function plainRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain object`);
  }
  return value;
}

function exactFields(value, fields, label) {
  plainRecord(value, label);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.prototype.hasOwnProperty.call(value, field)) ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  ) {
    fail(`${label} must contain exactly ${fields.join(', ')}`);
  }
}

function slug(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > LIMITS.slug_characters ||
    !SAFE_SLUG.test(value)
  ) {
    fail(`${label} must be a plain slug of at most ${LIMITS.slug_characters} characters`);
  }
  return value;
}

function title(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > LIMITS.title_characters ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(`${label} must be plain text of at most ${LIMITS.title_characters} characters`);
  }
  return value;
}

function boundedList(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain ${min}-${max} items`);
  }
  return value;
}

function prepareTree(tree) {
  plainRecord(tree, 'tree');
  boundedList(tree.domains, 'tree.domains', 1, LIMITS.domains);

  const domains = [];
  const guides = [];
  const bySlug = new Map();
  const domainKeys = new Set();

  tree.domains.forEach((domain, domainIndex) => {
    const domainLabel = `tree.domains[${domainIndex}]`;
    plainRecord(domain, domainLabel);
    slug(domain.key, `${domainLabel}.key`);
    title(domain.title, `${domainLabel}.title`);
    if (domainKeys.has(domain.key)) fail(`tree contains duplicate domain ${domain.key}`);
    domainKeys.add(domain.key);
    boundedList(
      domain.guides,
      `${domainLabel}.guides`,
      1,
      LIMITS.guides_per_domain
    );

    const preparedDomain = {
      key: domain.key,
      title: domain.title,
      guides: [],
    };
    domains.push(preparedDomain);

    domain.guides.forEach((guide, guideIndex) => {
      const guideLabel = `${domainLabel}.guides[${guideIndex}]`;
      plainRecord(guide, guideLabel);
      slug(guide.slug, `${guideLabel}.slug`);
      title(guide.title, `${guideLabel}.title`);
      if (!Object.prototype.hasOwnProperty.call(XP, guide.difficulty)) {
        fail(`${guideLabel}.difficulty must be easy, steady, hard, or mastery`);
      }
      boundedList(
        guide.needs,
        `${guideLabel}.needs`,
        0,
        LIMITS.needs_per_guide
      );
      guide.needs.forEach((need, needIndex) =>
        slug(need, `${guideLabel}.needs[${needIndex}]`)
      );
      if (new Set(guide.needs).size !== guide.needs.length) {
        fail(`${guideLabel}.needs contains duplicates`);
      }
      if (bySlug.has(guide.slug)) fail(`tree contains duplicate guide ${guide.slug}`);

      const preparedGuide = {
        slug: guide.slug,
        title: guide.title,
        domain: domain.key,
        difficulty: guide.difficulty,
        needs: [...guide.needs],
      };
      preparedDomain.guides.push(preparedGuide);
      guides.push(preparedGuide);
      bySlug.set(guide.slug, preparedGuide);
    });
  });

  if (guides.length > LIMITS.guides) {
    fail(`tree must contain at most ${LIMITS.guides} guides`);
  }

  for (const guide of guides) {
    for (const need of guide.needs) {
      if (!bySlug.has(need)) fail(`${guide.slug} needs unknown guide ${need}`);
      if (need === guide.slug) fail(`${guide.slug} cannot need itself`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(guide) {
    if (visiting.has(guide.slug)) {
      fail(`tree contains a prerequisite cycle at ${guide.slug}`);
    }
    if (visited.has(guide.slug)) return;
    visiting.add(guide.slug);
    guide.needs.forEach((need) => visit(bySlug.get(need)));
    visiting.delete(guide.slug);
    visited.add(guide.slug);
  }
  guides.forEach(visit);

  return { domains, guides, bySlug };
}

function guideView(guide, learned = undefined) {
  const view = {
    slug: guide.slug,
    title: guide.title,
    domain: guide.domain,
    difficulty: guide.difficulty,
    xp: XP[guide.difficulty],
    needs: [...guide.needs],
  };
  if (learned !== undefined) view.learned = learned;
  return view;
}

function canonicalState(context, state) {
  exactFields(state, STATE_FIELDS, 'state');
  if (state.schema_version !== STATE_SCHEMA_VERSION) {
    fail(`state.schema_version must be ${STATE_SCHEMA_VERSION}`);
  }
  if (state.goal !== null) {
    slug(state.goal, 'state.goal');
    if (!context.bySlug.has(state.goal)) fail(`state.goal names unknown guide ${state.goal}`);
  }
  boundedList(state.learned, 'state.learned', 0, LIMITS.guides);
  const learned = new Set();
  state.learned.forEach((learnedSlug, index) => {
    slug(learnedSlug, `state.learned[${index}]`);
    if (!context.bySlug.has(learnedSlug)) {
      fail(`state.learned names unknown guide ${learnedSlug}`);
    }
    if (learned.has(learnedSlug)) fail(`state.learned contains duplicate ${learnedSlug}`);
    learned.add(learnedSlug);
  });

  return Object.freeze({
    schema_version: STATE_SCHEMA_VERSION,
    goal: state.goal,
    learned: Object.freeze(
      context.guides.filter((guide) => learned.has(guide.slug)).map((guide) => guide.slug)
    ),
  });
}

function stateFor(context, goal, learned) {
  return canonicalState(context, {
    schema_version: STATE_SCHEMA_VERSION,
    goal,
    learned,
  });
}

function learnedSet(state) {
  return new Set(state.learned);
}

function totalXp(context, state) {
  return state.learned.reduce(
    (sum, learnedSlug) => sum + XP[context.bySlug.get(learnedSlug).difficulty],
    0
  );
}

export function xpThresholdForLevel(level) {
  if (!Number.isSafeInteger(level) || level < 1 || level > 1_000_000) {
    fail('level must be an integer from 1 to 1000000');
  }
  return (50 * level * (level - 1)) / 2;
}

export function levelForXp(xp) {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    fail('XP must be a non-negative safe integer');
  }
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 25)) / 2));
  while (xpThresholdForLevel(level + 1) <= xp) level += 1;
  while (xpThresholdForLevel(level) > xp) level -= 1;
  return level;
}

export function learningRank(learnedCount) {
  if (
    !Number.isSafeInteger(learnedCount) ||
    learnedCount < 0 ||
    learnedCount > LIMITS.guides
  ) {
    fail(`learned count must be an integer from 0 to ${LIMITS.guides}`);
  }
  let rank = RANKS[0];
  for (const candidate of RANKS) {
    if (learnedCount < candidate.learned) break;
    rank = candidate;
  }
  return {
    rank: rank.rank,
    threshold: rank.learned,
    meaning: 'distinct guides carrying explicit self-attested study marks',
    not_a_measure_of: [
      'human worth',
      'trust',
      'intelligence',
      'competence',
      'mastery',
    ],
  };
}

function xpView(context, state) {
  const total = totalXp(context, state);
  const level = levelForXp(total);
  const levelFloor = xpThresholdForLevel(level);
  const nextLevelAt = xpThresholdForLevel(level + 1);
  return {
    total,
    level,
    level_floor: levelFloor,
    next_level_at: nextLevelAt,
    into_level: total - levelFloor,
    to_next_level: nextLevelAt - total,
  };
}

function pathFor(context, goal) {
  if (goal === null) return [];
  slug(goal, 'goal');
  if (!context.bySlug.has(goal)) fail(`goal names unknown guide ${goal}`);
  const seen = new Set();
  const path = [];
  function collect(current) {
    if (seen.has(current)) return;
    const guide = context.bySlug.get(current);
    guide.needs.forEach(collect);
    seen.add(current);
    path.push(current);
  }
  collect(goal);
  return path;
}

export function goalPrerequisitePath(tree, goal) {
  return pathFor(prepareTree(tree), goal);
}

function readyFor(context, state) {
  const learned = learnedSet(state);
  return context.guides
    .filter(
      (guide) =>
        !learned.has(guide.slug) && guide.needs.every((need) => learned.has(need))
    )
    .map((guide) => ({ status: 'ARISE', ...guideView(guide) }));
}

export function readyGuides(tree, state) {
  const context = prepareTree(tree);
  return readyFor(context, canonicalState(context, state));
}

function domainViews(context, state) {
  const learned = learnedSet(state);
  return context.domains.map((domain) => {
    const count = domain.guides.reduce(
      (sum, guide) => sum + Number(learned.has(guide.slug)),
      0
    );
    return {
      key: domain.key,
      title: domain.title,
      learned: count,
      total: domain.guides.length,
      complete: count === domain.guides.length,
    };
  });
}

function hasDependencyChain(context, learned) {
  const complete = new Map();
  function isComplete(slugValue) {
    if (complete.has(slugValue)) return complete.get(slugValue);
    const guide = context.bySlug.get(slugValue);
    const result =
      learned.has(slugValue) && guide.needs.every((need) => isComplete(need));
    complete.set(slugValue, result);
    return result;
  }
  return context.guides.some(
    (guide) => guide.needs.length > 0 && isComplete(guide.slug)
  );
}

function achievementViews(context, state, domains) {
  const learned = learnedSet(state);
  const learnedDomainCount = domains.reduce(
    (sum, domain) => sum + Number(domain.learned > 0),
    0
  );
  const dependencyChain = hasDependencyChain(context, learned);
  const values = [
    {
      id: 'first-guide',
      title: 'First study',
      earned: learned.size >= 1,
      progress: Math.min(learned.size, 1),
      target: 1,
    },
    {
      id: 'three-domains',
      title: 'Three domains',
      earned: learnedDomainCount >= 3,
      progress: Math.min(learnedDomainCount, 3),
      target: 3,
    },
    {
      id: 'dependency-chain',
      title: 'One studied dependency chain',
      earned: dependencyChain,
      progress: Number(dependencyChain),
      target: 1,
    },
    {
      id: 'all-17-domains',
      title: 'All 17 domains',
      earned: context.domains.length === 17 && learnedDomainCount === 17,
      progress: Math.min(learnedDomainCount, 17),
      target: 17,
    },
  ];
  return values;
}

function goalView(context, state) {
  if (state.goal === null) return null;
  const learned = learnedSet(state);
  const path = pathFor(context, state.goal).map((pathSlug) =>
    guideView(context.bySlug.get(pathSlug), learned.has(pathSlug))
  );
  const next = path.find((guide) => !guide.learned) || null;
  return {
    slug: state.goal,
    path,
    next_unmet_quest: next,
    complete: next === null,
  };
}

function snapshotFor(context, state) {
  const domains = domainViews(context, state);
  return {
    state,
    learned_count: state.learned.length,
    xp: xpView(context, state),
    learning_rank: learningRank(state.learned.length),
    goal: goalView(context, state),
    ready: {
      call: 'ARISE',
      guides: readyFor(context, state),
    },
    domains,
    achievements: achievementViews(context, state, domains),
  };
}

export function validateLearningState(state, tree) {
  return canonicalState(prepareTree(tree), state);
}

export function createLearningState(tree, goal = null) {
  const context = prepareTree(tree);
  return stateFor(context, goal, []);
}

export function setLearningGoal(tree, state, goal) {
  const context = prepareTree(tree);
  const valid = canonicalState(context, state);
  return stateFor(context, goal, valid.learned);
}

export function learningSnapshot(tree, state) {
  const context = prepareTree(tree);
  return snapshotFor(context, canonicalState(context, state));
}

function milestone(snapshot) {
  return {
    learned_count: snapshot.learned_count,
    xp: snapshot.xp.total,
    level: snapshot.xp.level,
    learning_rank: snapshot.learning_rank.rank,
    learned_domains: snapshot.domains.filter((domain) => domain.learned > 0).length,
    achievements: snapshot.achievements
      .filter((achievement) => achievement.earned)
      .map((achievement) => achievement.id),
  };
}

export function addLearnedGuide(tree, state, guideSlug) {
  const context = prepareTree(tree);
  return addForContext(context, canonicalState(context, state), guideSlug);
}

export function exportLearningState(state, tree) {
  const valid = canonicalState(prepareTree(tree), state);
  return JSON.stringify({
    schema_version: valid.schema_version,
    goal: valid.goal,
    learned: valid.learned,
  });
}

export function importLearningState(serialized, tree) {
  if (
    typeof serialized !== 'string' ||
    serialized.length < 1 ||
    serialized.length > LIMITS.serialized_state_characters
  ) {
    fail(
      `serialized state must contain 1-${LIMITS.serialized_state_characters} characters`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    fail('serialized state must be valid JSON');
  }
  return canonicalState(prepareTree(tree), parsed);
}

export function createLearningEngine(tree) {
  const context = prepareTree(tree);
  return Object.freeze({
    definition: LEARNING_SYSTEM,
    createState(goal = null) {
      return stateFor(context, goal, []);
    },
    validateState(state) {
      return canonicalState(context, state);
    },
    setGoal(state, goal) {
      const valid = canonicalState(context, state);
      return stateFor(context, goal, valid.learned);
    },
    goalPath(goal) {
      return pathFor(context, goal);
    },
    ready(state) {
      return readyFor(context, canonicalState(context, state));
    },
    snapshot(state) {
      return snapshotFor(context, canonicalState(context, state));
    },
    add(state, guideSlug) {
      const valid = canonicalState(context, state);
      return addForContext(context, valid, guideSlug);
    },
    exportState(state) {
      const valid = canonicalState(context, state);
      return JSON.stringify({
        schema_version: valid.schema_version,
        goal: valid.goal,
        learned: valid.learned,
      });
    },
    importState(serialized) {
      if (
        typeof serialized !== 'string' ||
        serialized.length < 1 ||
        serialized.length > LIMITS.serialized_state_characters
      ) {
        fail(
          `serialized state must contain 1-${LIMITS.serialized_state_characters} characters`
        );
      }
      let parsed;
      try {
        parsed = JSON.parse(serialized);
      } catch {
        fail('serialized state must be valid JSON');
      }
      return canonicalState(context, parsed);
    },
  });
}

function addForContext(context, beforeState, guideSlug) {
  slug(guideSlug, 'guide slug');
  const guide = context.bySlug.get(guideSlug);
  if (!guide) fail(`guide slug names unknown guide ${guideSlug}`);
  const duplicate = beforeState.learned.includes(guideSlug);
  const afterState = duplicate
    ? beforeState
    : stateFor(context, beforeState.goal, [...beforeState.learned, guideSlug]);
  const beforeSnapshot = snapshotFor(context, beforeState);
  const afterSnapshot = duplicate ? beforeSnapshot : snapshotFor(context, afterState);
  const beforeAchievements = new Set(
    beforeSnapshot.achievements
      .filter((achievement) => achievement.earned)
      .map((achievement) => achievement.id)
  );
  const achievementsUnlocked = afterSnapshot.achievements.filter(
    (achievement) => achievement.earned && !beforeAchievements.has(achievement.id)
  );
  const xpAward = duplicate ? 0 : XP[guide.difficulty];
  return {
    state: afterState,
    receipt: {
      guide: guideSlug,
      duplicate,
      before: milestone(beforeSnapshot),
      award: {
        items: [
          duplicate
            ? { kind: 'duplicate', slug: guideSlug, xp: 0 }
            : {
                kind: 'guide-study-mark',
                slug: guideSlug,
                difficulty: guide.difficulty,
                xp: xpAward,
              },
        ],
        total_xp: xpAward,
        achievements_unlocked: achievementsUnlocked.map(({ id, title: name }) => ({
          id,
          title: name,
        })),
      },
      after: milestone(afterSnapshot),
    },
  };
}

export const LEARNING_STATE_SCHEMA_VERSION = STATE_SCHEMA_VERSION;
export const LEARNING_XP_WEIGHTS = XP;
export const LEARNING_RANK_THRESHOLDS = RANKS;
