// The Mindicraft System — an optional, private learning lens.
//
// Nothing is inferred from visits, scrolling, time, or search. Progress changes
// only after a learner chooses a quest, completes the three reflection checks,
// imports a state, removes a mark, or erases the state. The only network reads
// are Mindicraft's own static tree and translated search index.

import {
  LEARNING_STATE_SCHEMA_VERSION,
  createLearningEngine,
} from './learning-system.mjs';

const STATE_KEY = 'mindicraft.learning-state/1';
const MODE_KEY = 'mindicraft.learning-mode/1';
const MAX_IMPORT_BYTES = 32_768;
const PAGE = document.body?.dataset.learningPage || '';

if (PAGE) {
  start().catch(() => showLoadFailure());
}

async function start() {
  const lang = document.documentElement.lang || 'en';
  const words = readWords();
  const [tree, translated] = await Promise.all([
    getJson('/api/tree.json'),
    getJson(`/api/search/${encodeURIComponent(lang)}.json`).catch(() => []),
  ]);
  const engine = createLearningEngine(tree);
  const catalog = buildCatalog(tree, translated, lang, words);
  const announcer = ensureAnnouncer();
  let mode = readMode();
  let state = readState(engine);
  let volatileState = null;
  let undoState = null;
  let message = '';
  let messageRevision = 0;
  let announcedRevision = -1;
  let lastReceipt = null;

  function currentState() {
    return volatileState || state;
  }

  function setMessage(next) {
    message = next;
    messageRevision += 1;
  }

  function persist(next, { allowQuiet = false } = {}) {
    if (mode === 'quiet' && !allowQuiet) {
      return { accepted: false, saved: false };
    }
    const valid = engine.validateState(next);
    state = valid;
    volatileState = null;
    setMessage('');
    let saved = true;
    try {
      localStorage.setItem(STATE_KEY, engine.exportState(valid));
    } catch {
      saved = false;
      volatileState = valid;
      setMessage(words.saveFailed);
    }
    return { accepted: true, saved };
  }

  function setMode(next) {
    mode = next === 'quiet' ? 'quiet' : 'play';
    setMessage('');
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // The preference still applies to this tab. No progress is inferred.
    }
    render();
  }

  function erase() {
    undoState = currentState();
    state = engine.createState();
    volatileState = null;
    lastReceipt = null;
    let erasedFromStorage = true;
    try {
      localStorage.removeItem(STATE_KEY);
    } catch {
      erasedFromStorage = false;
      volatileState = state;
    }
    setMessage(erasedFromStorage ? words.erased : words.eraseFailed);
    render();
  }

  function undo() {
    if (!undoState) return;
    const previous = undoState;
    undoState = null;
    const outcome = persist(previous, { allowQuiet: true });
    if (!outcome.accepted) return;
    if (outcome.saved) setMessage(words.undone);
    render();
  }

  function removeGuide(slug) {
    const before = engine.snapshot(currentState());
    const next = engine.validateState({
      schema_version: LEARNING_STATE_SCHEMA_VERSION,
      goal: currentState().goal,
      learned: currentState().learned.filter((item) => item !== slug),
    });
    undoState = currentState();
    const outcome = persist(next);
    if (!outcome.accepted) return;
    const after = engine.snapshot(next);
    lastReceipt = {
      guide: slug,
      before: { xp: before.xp.total },
      award: { total_xp: after.xp.total - before.xp.total },
      after: { xp: after.xp.total },
    };
    if (outcome.saved) setMessage(words.studyRemoved);
    render();
  }

  function chooseGoal(slug) {
    undoState = currentState();
    const outcome = persist(engine.setGoal(currentState(), slug));
    if (!outcome.accepted) return;
    if (outcome.saved) setMessage(words.questChosen);
    render();
  }

  function clearGoal() {
    undoState = currentState();
    const outcome = persist(engine.setGoal(currentState(), null));
    if (!outcome.accepted) return;
    if (outcome.saved) setMessage(words.questCleared);
    render();
  }

  function recordGuide(slug) {
    const result = engine.add(currentState(), slug);
    undoState = currentState();
    const outcome = persist(result.state);
    if (!outcome.accepted) return;
    lastReceipt = result.receipt;
    if (outcome.saved) setMessage(words.alreadyStudied);
    render();
  }

  function exportState() {
    const blob = new Blob([engine.exportState(currentState()) + '\n'], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'mindicraft-learning-progress.json';
    link.click();
    queueMicrotask(() => URL.revokeObjectURL(href));
  }

  async function importState(file, input) {
    try {
      if (!file || file.size > MAX_IMPORT_BYTES) throw new Error('too large');
      const imported = engine.importState(await file.text());
      undoState = currentState();
      const outcome = persist(imported, { allowQuiet: false });
      if (!outcome.accepted) return;
      if (outcome.saved) setMessage(words.imported);
      render();
    } catch {
      setMessage(words.importFailed);
      render();
    } finally {
      input.value = '';
    }
  }

  function render() {
    const focusKey = document.activeElement?.dataset?.learningFocus || '';
    const snapshot = engine.snapshot(currentState());
    document.documentElement.dataset.learningMode = mode;
    updateDoor(words, snapshot, mode);
    clearInjected();
    markCards(words, snapshot, mode);

    if (mode !== 'quiet') {
      if (PAGE === 'home' || PAGE === 'domain') {
        injectStrip(words, snapshot, catalog, lang);
      } else if (PAGE === 'guide') {
        injectCheckpoint({
          words,
          snapshot,
          catalog,
          lang,
          message,
          lastReceipt,
          chooseGoal,
          clearGoal,
          recordGuide,
          removeGuide,
        });
      }
    }

    if (PAGE === 'system') {
      renderDashboard({
        words,
        snapshot,
        catalog,
        lang,
        mode,
        message,
        lastReceipt,
        undoState,
        setMode,
        clearGoal,
        exportState,
        importState,
        erase,
        undo,
      });
    }

    if (announcedRevision !== messageRevision) {
      const revision = messageRevision;
      const announcement = message;
      announcedRevision = revision;
      announcer.textContent = '';
      if (announcement) {
        queueMicrotask(() => {
          if (announcedRevision === revision) announcer.textContent = announcement;
        });
      }
    }

    if (focusKey) {
      queueMicrotask(() => {
        const nextControl = document.querySelector(
          `[data-learning-focus="${focusKey}"]`
        );
        if (nextControl && !nextControl.matches(':disabled')) {
          nextControl.focus();
          return;
        }
        const fallback = document.querySelector('[data-learning-focus-fallback]');
        if (fallback) {
          fallback.focus();
          return;
        }
        document.querySelector('[data-system-door]')?.focus();
      });
    }
  }

  addEventListener('storage', (event) => {
    const stateChanged = event.key === STATE_KEY || event.key === null;
    const modeChanged = event.key === MODE_KEY || event.key === null;
    if (!stateChanged && !modeChanged) return;
    if (modeChanged) mode = readMode();
    if (stateChanged) {
      undoState = null;
      lastReceipt = null;
      if (volatileState) {
        setMessage(words.unsavedTabKept);
      } else {
        state = readState(engine);
        setMessage('');
      }
    }
    render();
  });

  render();
}

async function getJson(path) {
  const response = await fetch(path, {
    method: 'GET',
    headers: { accept: 'application/json' },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function readWords() {
  const source = document.getElementById('learning-words');
  if (!source) throw new Error('learning words missing');
  const parsed = JSON.parse(source.textContent || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('learning words malformed');
  }
  return parsed;
}

function ensureAnnouncer() {
  const existing = document.getElementById('learning-announcer');
  if (existing) return existing;
  const announcer = document.createElement('p');
  announcer.id = 'learning-announcer';
  announcer.className = 'sr-only';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  document.body.append(announcer);
  return announcer;
}

function readMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'play' ? 'play' : 'quiet';
  } catch {
    return 'quiet';
  }
}

function readState(engine) {
  try {
    const serialized = localStorage.getItem(STATE_KEY);
    return serialized ? engine.importState(serialized) : engine.createState();
  } catch {
    return engine.createState();
  }
}

function buildCatalog(tree, translated, lang, words) {
  const translatedBySlug = new Map(
    (Array.isArray(translated) ? translated : []).map((guide) => [guide.slug, guide])
  );
  const bySlug = new Map();
  for (const domain of tree.domains) {
    for (const guide of domain.guides) {
      const local = translatedBySlug.get(guide.slug);
      bySlug.set(guide.slug, {
        ...guide,
        domain: domain.key,
        domainTitle: domain.i18n?.[lang]?.title || domain.title,
        difficultyLabel:
          words.difficultyWords?.[guide.difficulty] || guide.difficulty,
        title: local?.title || guide.title,
        href: `/${lang}/${domain.key}/${guide.slug}/`,
      });
    }
  }
  return bySlug;
}

function clearInjected() {
  document.querySelectorAll('[data-learning-injected]').forEach((node) => node.remove());
}

function updateDoor(words, snapshot, mode) {
  const door = document.querySelector('[data-system-door]');
  if (!door) return;
  door.textContent =
    mode === 'quiet'
      ? `⚔ ${words.quietNav}`
      : `⚔ ${words.nav} · ${snapshot.learning_rank.rank} · ${words.level} ${snapshot.xp.level}`;
  door.setAttribute(
    'aria-label',
    mode === 'quiet'
      ? `${words.nav}: ${words.paused}`
      : `${words.nav}: ${words.rank} ${snapshot.learning_rank.rank}, ${words.level} ${snapshot.xp.level}`
  );
}

function markCards(words, snapshot, mode) {
  const learned = new Set(snapshot.state.learned);
  document.querySelectorAll('[data-guide-card]').forEach((card) => {
    card.classList.remove('is-learned', 'is-quest');
    if (mode === 'quiet') return;
    const slug = card.dataset.guideCard;
    if (learned.has(slug)) {
      card.classList.add('is-learned');
      card.append(makeMark(words.alreadyStudied, ''));
    }
    if (snapshot.state.goal === slug) {
      card.classList.add('is-quest');
      card.append(makeMark(words.currentQuest, 'is-quest'));
    }
  });
}

function makeMark(text, extraClass) {
  const mark = document.createElement('span');
  mark.dataset.learningInjected = '';
  mark.className = `learning-card-mark${extraClass ? ` ${extraClass}` : ''}`;
  mark.textContent = text;
  return mark;
}

function injectStrip(words, snapshot, catalog, lang) {
  const strip = document.createElement('aside');
  strip.dataset.learningInjected = '';
  strip.className = 'learning-strip';
  strip.setAttribute('aria-label', words.nav);

  const rank = document.createElement('span');
  rank.className = 'learning-strip-rank';
  rank.textContent = snapshot.learning_rank.rank;

  const copy = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = `${words.level} ${snapshot.xp.level} · ${snapshot.xp.total} ${words.xp}`;
  const next = document.createElement('small');
  const quest = snapshot.goal?.next_unmet_quest || snapshot.ready.guides[0] || null;
  next.textContent = quest
    ? `${words.currentQuest}: ${catalog.get(quest.slug)?.title || quest.title}`
    : words.noReady;
  copy.append(title, next);

  const link = document.createElement('a');
  link.href = `/${lang}/system/`;
  link.textContent = `${snapshot.learned_count} / ${catalog.size} ${words.studied}`;
  strip.append(rank, copy, link);

  const anchor = PAGE === 'home' ? document.querySelector('.hero') : document.querySelector('.intro');
  anchor?.insertAdjacentElement('afterend', strip);
}

function injectCheckpoint({
  words,
  snapshot,
  catalog,
  lang,
  message,
  lastReceipt,
  chooseGoal,
  clearGoal,
  recordGuide,
  removeGuide,
}) {
  const slug = document.body.dataset.guideId;
  const article = document.querySelector('article.guide');
  if (!slug || !article || !catalog.has(slug)) return;
  const learned = snapshot.state.learned.includes(slug);
  const section = document.createElement('section');
  section.dataset.learningInjected = '';
  section.className = 'learning-checkpoint';
  section.setAttribute('aria-labelledby', 'learning-checkpoint-title');

  const heading = document.createElement('h2');
  heading.id = 'learning-checkpoint-title';
  heading.tabIndex = -1;
  heading.dataset.learningFocusFallback = '';
  heading.textContent = words.checkpointTitle;
  const intro = document.createElement('p');
  intro.textContent = learned ? words.selfAttested : words.checkpointIntro;
  section.append(heading, intro);
  if (document.body.dataset.domainId === 'staying-well') {
    const healthBoundary = document.createElement('p');
    healthBoundary.className = 'system-boundary';
    healthBoundary.textContent = words.healthBoundary;
    section.append(healthBoundary);
  }

  const actions = document.createElement('div');
  actions.className = 'system-actions';
  if (snapshot.state.goal === slug) {
    actions.append(actionButton(words.clearQuest, clearGoal, false, 'guide-goal'));
  } else {
    actions.append(
      actionButton(words.chooseQuest, () => chooseGoal(slug), false, 'guide-goal')
    );
  }

  if (learned) {
    const recorded = actionButton(words.alreadyStudied, () => {});
    recorded.disabled = true;
    actions.append(
      recorded,
      actionButton(
        words.removeStudy,
        () => removeGuide(slug),
        true,
        'guide-remove'
      )
    );
  } else {
    const checks = document.createElement('div');
    checks.className = 'learning-checks';
    const inputs = [words.checkExplain, words.checkLimit, words.checkConnect].map(
      (labelText, index) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = `learning-reflection-${index + 1}`;
        input.dataset.learningFocus = `guide-reflection-${index + 1}`;
        const text = document.createElement('span');
        text.textContent = labelText;
        label.append(input, text);
        checks.append(label);
        return input;
      }
    );
    const record = actionButton(
      words.recordStudy,
      () => recordGuide(slug),
      false,
      'guide-record'
    );
    record.disabled = true;
    const sync = () => {
      record.disabled = !inputs.every((input) => input.checked);
    };
    inputs.forEach((input) => input.addEventListener('change', sync));
    section.append(checks);
    actions.append(record);
  }
  section.append(actions);
  const status = document.createElement('p');
  status.className = 'system-message';
  status.textContent = message;
  section.append(status);
  if (lastReceipt?.guide === slug) section.append(receiptNode(words, lastReceipt, catalog));
  const margin = article.querySelector('.marginbox');
  article.insertBefore(section, margin || null);
}

function actionButton(text, onClick, danger = false, focusKey = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `system-button${danger ? ' system-button-danger' : ''}`;
  if (focusKey) button.dataset.learningFocus = focusKey;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function renderDashboard({
  words,
  snapshot,
  catalog,
  lang,
  mode,
  message,
  lastReceipt,
  undoState,
  setMode,
  clearGoal,
  exportState,
  importState,
  erase,
  undo,
}) {
  const dashboard = document.getElementById('learning-system-dashboard');
  if (!dashboard) return;
  dashboard.replaceChildren();

  if (mode === 'quiet') {
    const paused = document.createElement('p');
    paused.className = 'system-boundary';
    paused.textContent = words.paused;
    dashboard.append(paused);
  } else {
    dashboard.append(
      statusWindow(words, snapshot, catalog),
      questSection(words, snapshot, catalog, clearGoal),
      readySection(words, snapshot, catalog),
      binderSection(words, snapshot, catalog)
    );
  }

  const controls = document.createElement('section');
  controls.className = 'system-section';
  const heading = document.createElement('h2');
  heading.tabIndex = -1;
  heading.dataset.learningFocusFallback = '';
  heading.textContent = words.controls;
  const hint = document.createElement('p');
  hint.textContent = words.quietHelp;
  const actions = document.createElement('div');
  actions.className = 'system-actions';
  actions.append(
    actionButton(
      mode === 'quiet' ? words.wake : words.quiet,
      () => setMode(mode === 'quiet' ? 'play' : 'quiet'),
      false,
      'system-mode'
    ),
    actionButton(words.exportProgress, exportState, false, 'system-export')
  );

  if (mode !== 'quiet') {
    const fileLabel = document.createElement('label');
    fileLabel.className = 'system-file-label';
    fileLabel.textContent = words.importProgress;
    const file = document.createElement('input');
    file.type = 'file';
    file.dataset.learningFocus = 'system-import';
    file.accept = 'application/json,.json';
    file.addEventListener('change', () => importState(file.files?.[0], file));
    fileLabel.append(file);
    actions.append(fileLabel);
  }
  actions.append(
    actionButton(words.eraseProgress, erase, true, 'system-erase')
  );
  if (undoState) {
    actions.append(actionButton(words.undo, undo, false, 'system-undo'));
  }

  const status = document.createElement('p');
  status.className = 'system-message';
  status.textContent = message;
  controls.append(heading, hint, actions, status);
  dashboard.append(controls);
  if (lastReceipt) dashboard.append(receiptNode(words, lastReceipt, catalog));
}

function statusWindow(words, snapshot, catalog) {
  const window = document.createElement('section');
  window.className = 'system-window';
  window.setAttribute('aria-labelledby', 'system-window-title');

  const heading = document.createElement('div');
  heading.className = 'system-heading';
  const title = document.createElement('h2');
  title.id = 'system-window-title';
  title.textContent = `⚔ ${words.pageTitle}`;
  const truth = document.createElement('span');
  truth.textContent = words.selfAttested;
  heading.append(title, truth);

  const rankRow = document.createElement('div');
  rankRow.className = 'system-rank-row';
  const rank = document.createElement('span');
  rank.className = 'system-rank';
  rank.textContent = snapshot.learning_rank.rank;
  const rankCopy = document.createElement('div');
  rankCopy.className = 'system-rank-copy';
  const strong = document.createElement('strong');
  strong.textContent = `${words.rank} ${snapshot.learning_rank.rank} · ${words.level} ${snapshot.xp.level}`;
  const small = document.createElement('small');
  small.textContent = `${snapshot.xp.total} ${words.xp} · ${snapshot.xp.to_next_level} ${words.nextLevel}`;
  rankCopy.append(strong, small);
  rankRow.append(rank, rankCopy);

  const xpLabel = document.createElement('div');
  xpLabel.className = 'system-xp-label';
  const current = document.createElement('span');
  current.textContent = `${snapshot.xp.into_level} ${words.xp}`;
  const next = document.createElement('span');
  next.textContent = `${snapshot.xp.next_level_at - snapshot.xp.level_floor} ${words.nextLevel}`;
  xpLabel.append(current, next);
  const progress = document.createElement('progress');
  progress.className = 'system-progress';
  progress.max = snapshot.xp.next_level_at - snapshot.xp.level_floor;
  progress.value = snapshot.xp.into_level;
  progress.textContent = `${snapshot.xp.into_level} / ${progress.max}`;
  progress.setAttribute(
    'aria-label',
    `${words.xp}: ${snapshot.xp.into_level} / ${progress.max} ${words.nextLevel}`
  );

  const stats = document.createElement('div');
  stats.className = 'system-stats';
  const domainCount = snapshot.domains.filter((domain) => domain.learned > 0).length;
  const earned = snapshot.achievements.filter((achievement) => achievement.earned).length;
  stats.append(
    statNode(snapshot.learned_count, `${words.studied} / ${catalog.size}`),
    statNode(domainCount, `${words.domains} / ${snapshot.domains.length}`),
    statNode(earned, `${words.sigils} / ${snapshot.achievements.length}`)
  );
  const sigilHelp = document.createElement('p');
  sigilHelp.className = 'system-sigil-help';
  sigilHelp.textContent = words.sigilHelp;
  window.append(heading, rankRow, xpLabel, progress, stats, sigilHelp);
  return window;
}

function statNode(value, label) {
  const stat = document.createElement('div');
  stat.className = 'system-stat';
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  const span = document.createElement('span');
  span.textContent = label;
  stat.append(strong, span);
  return stat;
}

function questSection(words, snapshot, catalog, clearGoal) {
  const section = document.createElement('section');
  section.className = 'system-section';
  const heading = document.createElement('h2');
  heading.textContent = words.currentQuest;
  section.append(heading);
  if (!snapshot.goal) {
    const empty = document.createElement('p');
    empty.textContent = words.noQuest;
    section.append(empty);
    return section;
  }

  const goal = catalog.get(snapshot.goal.slug);
  const name = document.createElement('p');
  const link = document.createElement('a');
  link.href = goal?.href || '#';
  link.textContent = goal?.title || snapshot.goal.slug;
  name.append(link);
  const list = document.createElement('ol');
  list.className = 'system-quest-path';
  for (const step of snapshot.goal.path) {
    const guide = catalog.get(step.slug);
    const item = document.createElement('li');
    if (step.learned) item.className = 'is-done';
    const stepLink = document.createElement('a');
    stepLink.href = guide?.href || '#';
    stepLink.textContent = guide?.title || step.title;
    const status = document.createElement('small');
    status.textContent = step.learned ? words.alreadyStudied : `${step.xp} ${words.xp}`;
    item.append(stepLink, status);
    list.append(item);
  }
  section.append(
    name,
    list,
    actionButton(words.clearQuest, clearGoal, false, 'system-clear-goal')
  );
  return section;
}

function readySection(words, snapshot, catalog) {
  const section = document.createElement('section');
  section.className = 'system-section';
  const heading = document.createElement('h2');
  heading.textContent = words.readyNext;
  const hint = document.createElement('p');
  hint.textContent = words.readyHint;
  section.append(heading, hint);
  const list = document.createElement('ul');
  list.className = 'system-ready-list';
  const ready = snapshot.ready.guides;
  if (!ready.length) {
    const empty = document.createElement('li');
    empty.textContent = words.noReady;
    list.append(empty);
  } else {
    for (const item of ready) list.append(guideLinkItem(item, catalog, words));
  }
  section.append(list);
  return section;
}

function binderSection(words, snapshot, catalog) {
  const section = document.createElement('section');
  section.className = 'system-section';
  const heading = document.createElement('h2');
  heading.textContent = words.binder;
  section.append(heading);
  const list = document.createElement('ul');
  list.className = 'system-binder-list';
  if (!snapshot.state.learned.length) {
    const empty = document.createElement('li');
    empty.textContent = words.emptyBinder;
    list.append(empty);
  } else {
    for (const slug of snapshot.state.learned) {
      const guide = catalog.get(slug);
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = guide?.href || '#';
      link.textContent = guide?.title || slug;
      const small = document.createElement('small');
      small.textContent = `${guide?.difficultyLabel || ''} · ${guide?.domainTitle || ''}`;
      item.append(link, small);
      list.append(item);
    }
  }
  section.append(list);
  return section;
}

function guideLinkItem(item, catalog, words) {
  const guide = catalog.get(item.slug);
  const li = document.createElement('li');
  const link = document.createElement('a');
  link.href = guide?.href || '#';
  const title = document.createElement('strong');
  title.textContent = guide?.title || item.title;
  const small = document.createElement('small');
  small.textContent = `${guide?.difficultyLabel || item.difficulty} · +${item.xp} ${words.xp}`;
  link.append(title, small);
  li.append(link);
  return li;
}

function receiptNode(words, receipt, catalog) {
  const node = document.createElement('aside');
  node.className = 'system-receipt';
  node.setAttribute('aria-label', words.localReceipt);
  const title = document.createElement('strong');
  title.textContent = words.localReceipt;
  const guide = catalog.get(receipt.guide);
  const details = document.createElement('span');
  const award = Number(receipt.award?.total_xp || 0);
  details.textContent = ` · ${guide?.title || receipt.guide} · ${words.before}: ${receipt.before.xp} ${words.xp} · ${words.award}: ${award >= 0 ? '+' : ''}${award} ${words.xp} · ${words.after}: ${receipt.after.xp} ${words.xp}`;
  node.append(title, details);
  return node;
}

function showLoadFailure() {
  const dashboard = document.getElementById('learning-system-dashboard');
  if (dashboard) {
    const message = document.createElement('p');
    message.className = 'notice';
    try {
      message.textContent = readWords().loadFailed;
    } catch {
      message.textContent = 'The System could not read the static tree. Every guide remains open.';
    }
    dashboard.replaceChildren(message);
  }
}
