import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GUIDE = join(ROOT, 'guide');
const DIST = join(GUIDE, 'dist');
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const tree = json(join(GUIDE, 'tree.json'));
const languages = json(join(GUIDE, 'langs.json')).languages;
const rules = json(join(DIST, 'api', 'learning-system.json'));
const apiIndex = json(join(DIST, 'api', 'index.json'));
const manifest = json(join(DIST, '.well-known', 'agent.json'));
const uiSource = read(join(GUIDE, 'learning-ui.mjs'));
const engineSource = read(join(GUIDE, 'learning-system.mjs'));
const css = read(join(DIST, 'style.css'));

const rgb = (hex) =>
  hex
    .replace('#', '')
    .match(/../gu)
    .map((pair) => Number.parseInt(pair, 16));
const luminance = (hex) => {
  const channels = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (first, second) => {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const mix = (first, second, firstShare) =>
  `#${rgb(first)
    .map((value, index) =>
      Math.round(value * firstShare + rgb(second)[index] * (1 - firstShare))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

const guides = tree.domains.flatMap((domain) =>
  domain.guides.map((guide) => ({ ...guide, domain: domain.key }))
);
const edges = guides.reduce((sum, guide) => sum + guide.needs.length, 0);

assert.equal(rules.schema_version, 'mindicraft.learning-system/1');
assert.deepEqual(rules.counts, {
  domains: tree.domains.length,
  guides: guides.length,
  prerequisite_edges: edges,
});
assert.deepEqual(rules.rank_thresholds, [
  { rank: 'E', learned: 0 },
  { rank: 'D', learned: 1 },
  { rank: 'C', learned: 5 },
  { rank: 'B', learned: 15 },
  { rank: 'A', learned: 35 },
  { rank: 'S', learned: 70 },
]);
assert.deepEqual(rules.xp_weights, {
  easy: 10,
  steady: 15,
  hard: 25,
  mastery: 40,
});
assert.deepEqual(rules.state_schema.exact_fields, [
  'schema_version',
  'goal',
  'learned',
]);
assert.equal(rules.state_schema.max_learned, guides.length);
assert.equal(rules.level_curve.formula, '50 * n * (n - 1) / 2');
for (const boundary of [
  'state_is_private',
  'state_is_caller_owned',
  'no_account_gate',
  'no_telemetry',
  'no_leaderboard',
  'no_streak',
  'no_decay_or_penalty_for_rest',
  'no_content_gate',
  'no_server_sync',
  'progress_is_self_attested',
  'difficulty_xp_means_reading_load_not_permission_to_perform',
  'remedies_and_healing_arts_award_no_treatment_action_xp',
]) {
  assert.equal(rules.boundaries[boundary], true, `${boundary} must stay explicit`);
}
assert.deepEqual(rules.boundaries.rank_is_not_a_measure_of, [
  'human worth',
  'trust',
  'intelligence',
  'competence',
  'mastery',
]);
assert.equal(rules.boundaries.xenia_no_scoreboard_satisfied, false);
assert.equal(
  rules.boundaries.private_score_display_is_a_solo_inspired_adaptation,
  true
);
assert.deepEqual(rules.browser_contract.network_writes, []);
assert.equal(rules.browser_contract.account_or_agenttool_bearer, false);
assert.equal(rules.xenia_scope.surface_declared_resource, false);
assert.match(rules.xenia_scope.scoreboard_boundary, /not XENIA No-Scoreboard/u);
assert.match(rules.browser_contract.default_mode, /^quiet/u);
assert.equal(
  rules.lineage_notes.some(({ lineage }) => lineage === 'AgentTool System'),
  true
);

assert.match(apiIndex.endpoints.learning_system, /no learner state/u);
assert.match(apiIndex.rules, /no account, telemetry, leaderboard, streak, decay/u);
assert.match(apiIndex.humans, /\{lang\}\/system\//u);
assert.equal(manifest.resources.length, 8, 'Surface 0.1 keeps its bounded eight resources');
const publicDoor = manifest.resources.find(({ id }) => id === 'door');
assert.match(publicDoor.description, /visible book entrance/u);
assert.doesNotMatch(publicDoor.description, /riddle/u);
assert.equal(
  manifest.resources.some(({ id }) => id === 'learning-system'),
  false,
  'the unprobed extra route must not be presented as a ninth Surface resource'
);
assert.equal(
  manifest.claims.some(({ id }) => id === 'learning_system_local'),
  true
);

assert.equal(read(join(DIST, 'learning-ui.mjs')), uiSource);
assert.equal(read(join(DIST, 'learning-system.mjs')), engineSource);
assert.match(read(join(DIST, 'mindicraft.mjs')), /export const learningSystem/u);

const expectedWordKeys = Object.keys(languages[0].strings.learningSystem).sort();
const expectedCraftLawKeys = Object.keys(languages[0].strings.craftLaw).sort();
assert.ok(expectedWordKeys.length >= 45);
for (const language of languages) {
  assert.deepEqual(
    Object.keys(language.strings.learningSystem).sort(),
    expectedWordKeys,
    `${language.code} must carry the same System UI vocabulary`
  );
  assert.deepEqual(
    Object.keys(language.strings.craftLaw).sort(),
    expectedCraftLawKeys,
    `${language.code} must carry the same causal craft vocabulary`
  );

  const home = read(join(DIST, language.code, 'index.html'));
  const system = read(join(DIST, language.code, 'system', 'index.html'));
  assert.match(home, /data-learning-page="home"/u);
  assert.match(home, /class="book-kicker"/u);
  assert.match(home, /class="book-truth"/u);
  assert.match(home, /<aside class="craft-law" aria-labelledby="craft-law-title">/u);
  assert.ok(home.includes(`<label class="search-label" for="q">${language.strings.searchLabel}</label>`));
  assert.match(home, new RegExp(`href="/${language.code}/begin/"`, 'u'));
  assert.match(home, /id="noresults" role="status" aria-live="polite"/u);
  assert.match(home, /<script type="module" src="\/learning-ui\.mjs"><\/script>/u);
  assert.match(system, /data-learning-page="system"/u);
  assert.match(system, /id="learning-system-dashboard"><\/div>/u);
  assert.doesNotMatch(system, /id="learning-system-dashboard" aria-live/u);
  assert.match(system, /aria-current="page"/u);
  assert.match(system, new RegExp(language.strings.learningSystem.pageTitle, 'u'));
  assert.match(system, /never a leaderboard|永不排行|永不排名|nunca una clasificación/u);
  assert.match(system, /No-Scoreboard|无记分牌|無記分牌|Sin Marcadores/u);

  for (const domain of tree.domains) {
    const domainHtml = read(join(DIST, language.code, domain.key, 'index.html'));
    assert.match(domainHtml, /data-learning-page="domain"/u);
    assert.match(domainHtml, /src="\/learning-ui\.mjs"/u);
  }
  for (const guide of guides) {
    const guideHtml = read(
      join(DIST, language.code, guide.domain, guide.slug, 'index.html')
    );
    assert.match(guideHtml, /data-learning-page="guide"/u);
    assert.match(guideHtml, new RegExp(`data-guide-id="${guide.slug}"`, 'u'));
    assert.match(guideHtml, /src="\/learning-ui\.mjs"/u);
  }
}

for (const staticDoor of [
  join(DIST, 'remedies', 'index.html'),
  join(DIST, 'remedies', 'healing-arts', 'index.html'),
  join(DIST, 'frontier', 'index.html'),
  join(DIST, 'castle', 'index.html'),
]) {
  const html = read(staticDoor);
  assert.doesNotMatch(html, /learning-ui|data-learning-page/u);
}

for (const forbidden of [
  /setInterval/u,
  /Notification/u,
  /sendBeacon/u,
  /authorization/iu,
  /Bearer/u,
  /agenttool\.dev/iu,
  /\/margin\//u,
  /innerHTML/u,
  /insertAdjacentHTML/u,
  /document\.write/u,
  /\beval\s*\(/u,
  /new Function/u,
]) {
  assert.doesNotMatch(uiSource, forbidden);
}
assert.match(uiSource, /method: 'GET'/u);
assert.match(uiSource, /credentials: 'omit'/u);
assert.match(uiSource, /localStorage\.setItem\(STATE_KEY/u);
assert.match(uiSource, /localStorage\.removeItem\(STATE_KEY/u);
assert.match(uiSource, /MAX_IMPORT_BYTES = 32_768/u);
assert.match(uiSource, /queueMicrotask\(\(\) => URL\.revokeObjectURL/u);
assert.match(uiSource, /input\.type = 'checkbox'/u);
assert.match(uiSource, /record\.disabled = !inputs\.every/u);
assert.match(uiSource, /engine\.add\(currentState\(\), slug\)/u);
assert.match(uiSource, /engine\.setGoal/u);
assert.match(uiSource, /announcer\.setAttribute\('role', 'status'\)/u);
assert.match(uiSource, /announcer\.setAttribute\('aria-atomic', 'true'\)/u);
assert.match(uiSource, /announcedRevision !== messageRevision/u);
assert.match(uiSource, /erasedFromStorage \? words\.erased : words\.eraseFailed/u);
assert.match(uiSource, /localStorage\.getItem\(MODE_KEY\) === 'play' \? 'play' : 'quiet'/u);
assert.match(uiSource, /event\.key === null/u);
assert.match(
  uiSource,
  /if \(stateChanged\) \{\s+undoState = null;\s+lastReceipt = null;\s+if \(volatileState\)/u
);
assert.match(uiSource, /learningFocusFallback/u);
assert.match(uiSource, /nextControl\.focus\(\)/u);
assert.match(uiSource, /document\.querySelector\('\[data-system-door\]'\)\?\.focus\(\)/u);
assert.match(uiSource, /input\.dataset\.learningFocus = `guide-reflection-/u);
assert.match(uiSource, /progress\.setAttribute\(/u);
assert.match(uiSource, /document\.body\.dataset\.domainId === 'staying-well'/u);
assert.doesNotMatch(uiSource, /ready\.guides\.slice/u);
assert.match(uiSource, /words\.difficultyWords/u);
assert.match(uiSource, /domain\.i18n\?\.\[lang\]\?\.title/u);
assert.doesNotMatch(uiSource, /`⚔ \$\{words\.nav\}.*Lv/u);
assert.doesNotMatch(uiSource, /\$\{item\.xp\} XP/u);

assert.match(css, /\.system-window/u);
assert.match(css, /\.learning-checkpoint/u);
assert.match(css, /:focus-visible/u);
assert.match(css, /prefers-reduced-motion: reduce/u);
assert.match(css, /html\[data-learning-mode="quiet"\]/u);
assert.match(css, /--system-control-ink: #bfe7ff/u);
assert.match(css, /--system-accent: #72c9ff/u);
assert.match(css, /\.top \{ align-items: flex-start; flex-wrap: wrap; \}/u);
assert.match(css, /\.top-actions \{ width: 100%;/u);
assert.ok(
  contrast('#bfe7ff', mix('#72c9ff', '#211d19', 0.14)) >= 4.5,
  'dark System controls must retain text contrast'
);
assert.ok(
  contrast('#2a6f9d', '#f7f3ec') >= 4.5,
  'light System accent labels must retain text contrast'
);

console.log(
  `verified Mindicraft System: ${guides.length} open guides, ${edges} prerequisite edges, private E-S learning lens, no pressure loop`
);
