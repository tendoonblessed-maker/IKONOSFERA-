import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');

test('CI token has explicit read-only repository permissions', () => {
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(workflow, /^\s+(?:actions|contents|deployments|issues|packages|pull-requests|statuses|workflows):\s*write\s*$/m);
});

test('CI verification has a bounded runtime', () => {
  const match = workflow.match(/^\s+timeout-minutes:\s*(\d+)\s*$/m);
  assert.ok(match, 'CI job must define timeout-minutes');
  const minutes = Number(match[1]);
  assert.ok(minutes >= 5 && minutes <= 30, 'CI timeout must be between 5 and 30 minutes');
});

test('CI retains typecheck, lint, tests and production build', () => {
  for (const command of ['npm run typecheck', 'npm run lint', 'npm test', 'npm run build']) {
    assert.ok(workflow.split('\n').some((line) => line.trim() === `- run: ${command}`), `missing CI step: ${command}`);
  }
});
