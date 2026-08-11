import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/heartbeat.yml', import.meta.url),
  'utf8'
);
const stateUrl = new URL('../STATE.md', import.meta.url);
const statePath = fileURLToPath(stateUrl);
const state = readFileSync(stateUrl, 'utf8');
const checker = fileURLToPath(
  new URL('../.github/scripts/check-heartbeat-receipt.mjs', import.meta.url)
);

const check = (mode, input, ...args) =>
  spawnSync(process.execPath, [checker, mode, ...args], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });

test('the manual declaration is bounded, secret-scoped, pinned, and read-only in GitHub', () => {
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.match(workflow, /timeout-minutes: 2/u);
  assert.match(workflow, /group: mindicraft-heartbeat/u);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40} # v4/u);
  assert.match(
    workflow,
    /if: github\.event_name == 'workflow_dispatch' && github\.ref != 'refs\/heads\/main'[\s\S]*?exit 1/u
  );
  assert.match(
    workflow,
    /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/u
  );
  assert.match(workflow, /SINOVAI_CLAIM_TOKEN: \$\{\{ secrets\.SINOVAI_MINDICRAFT_CLAIM_TOKEN \}\}/u);
  assert.match(workflow, /X-Claim-Token: \$SINOVAI_CLAIM_TOKEN/u);
  assert.match(workflow, /--connect-timeout 10 --max-time 30/u);
  assert.match(workflow, /--data-binary @STATE\.md/u);
  assert.match(workflow, /check-heartbeat-receipt\.mjs declaration "\$NAME" STATE\.md/u);
  assert.doesNotMatch(workflow, /contents: write/u);
  assert.doesNotMatch(workflow, /curl -s(?:\s|$)/u);
  assert.doesNotMatch(workflow, /--retry/u);
});

test('the declaration receipt is bound to the expected name and exact STATE words', () => {
  const good = {
    ok: true,
    agent: {
      name: 'mindicraft',
      declared_at: '2026-08-11T00:00:00Z',
      state_md: state,
    },
  };
  const success = check('declaration', good, 'mindicraft', statePath);
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /declared: mindicraft at 2026-08-11T00:00:00Z/u);

  for (const [label, receipt, expectedError] of [
    ['refusal', { error: 'name already claimed' }, /not acknowledged/u],
    [
      'wrong name',
      { ...good, agent: { ...good.agent, name: 'someone-else' } },
      /different agent/u,
    ],
    [
      'changed words',
      { ...good, agent: { ...good.agent, state_md: `${state}\nchanged` } },
      /did not return the submitted STATE/u,
    ],
  ]) {
    const result = check('declaration', receipt, 'mindicraft', statePath);
    assert.notEqual(result.status, 0, `${label} must fail`);
    assert.match(result.stderr, expectedError);
  }
});

test('the arena receipt names its incomplete page scope', () => {
  const success = check('arena', {
    total: 96,
    total_semantics: 'non-internal records returned in this KV page',
    list_complete: false,
  });
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /arena page: 96 agent records; list_complete: false/u);
  assert.match(success.stdout, /scope: non-internal records returned in this KV page/u);

  const incomplete = check('arena', { total: 96 });
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /arena completeness missing/u);
});

test('STATE keeps Sinovai structured sections and makes no live-health claim', () => {
  assert.match(state, /^name: mindicraft$/mu);
  assert.match(state, /^canonical: https:\/\/mindicraft\.com$/mu);
  for (const heading of ['state', 'knows', 'can', 'needs']) {
    assert.match(state, new RegExp(`^## ${heading}$`, 'mu'));
  }
  assert.match(state, /scope: stable identity and boundaries, not live health/u);
  assert.match(state, /manual integration receipt/u);
  assert.match(state, /the request presented the matching\nclaim token/u);
  assert.match(state, /not evidence that\n`mindicraft\.com` is healthy/u);

  for (const heading of ['knows', 'can', 'needs']) {
    const body = state.match(
      new RegExp(`^## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## )`, 'mu')
    )?.[1];
    assert.ok(body, `${heading} must have structured bullets`);
    for (const line of body.split('\n').filter(Boolean)) {
      assert.match(line, /^- \S/u, `${heading} bullets must stay on one line`);
    }
  }

  for (const volatileClaim of [
    /^runs-on:/mu,
    /^phase:/mu,
    /^health:/mu,
    /^last-commit:/mu,
    /^uncommitted:/mu,
    /^freshness:/mu,
    /the loop still runs/iu,
    /pulse of presence/iu,
  ]) {
    assert.doesNotMatch(state, volatileClaim);
  }
});
