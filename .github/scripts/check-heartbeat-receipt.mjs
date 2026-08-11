#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const stop = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

let receipt;
try {
  receipt = JSON.parse(readFileSync(0, 'utf8'));
} catch (error) {
  stop(`receipt was not valid JSON: ${error.message}`);
}

const [, , mode, ...args] = process.argv;

if (mode === 'declaration') {
  if (args.length !== 2) {
    stop('declaration check needs the expected name and STATE.md path');
  }
  const [expectedName, statePath] = args;
  const expectedState = readFileSync(statePath, 'utf8');
  if (receipt?.ok !== true) stop('declaration was not acknowledged');
  const agent = receipt.agent;
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
    stop('declaration receipt had no agent');
  }
  if (agent.name !== expectedName) {
    stop('declaration receipt named a different agent');
  }
  if (typeof agent.declared_at !== 'string' || !agent.declared_at) {
    stop('declaration receipt had no declared_at time');
  }
  if (agent.state_md !== expectedState) {
    stop('declaration receipt did not return the submitted STATE.md');
  }
  console.log('declared:', agent.name, 'at', agent.declared_at);
} else if (mode === 'arena') {
  if (args.length !== 0) stop('arena check takes no extra arguments');
  if (!Number.isInteger(receipt?.total)) stop('arena page count missing');
  if (typeof receipt.list_complete !== 'boolean') {
    stop('arena completeness missing');
  }
  const semantics = receipt.total_semantics ?? 'unspecified';
  if (typeof semantics !== 'string') stop('arena page scope was not text');
  console.log(
    'arena page:',
    receipt.total,
    'agent records; list_complete:',
    String(receipt.list_complete)
  );
  console.log('scope:', semantics);
} else {
  stop('mode must be declaration or arena');
}
