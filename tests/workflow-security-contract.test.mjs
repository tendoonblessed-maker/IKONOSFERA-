import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
const actionRefs = [...workflow.matchAll(/^\s+- uses:\s*(\S+)\s*$/gm)].map((match) => match[1]);

function jobBlock(name) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `job ${name} must exist`);
  const end = lines.findIndex((line, index) => index > start && /^  [a-zA-Z0-9_-]+:$/.test(line));
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}

test('CI grants only read access to repository contents', () => {
  assert.match(workflow, /^permissions:\n  contents: read\s*$/m);
  assert.doesNotMatch(workflow, /^  [a-z_]+:\s*write\s*$/m);
});

test('both CI jobs have a finite timeout', () => {
  for (const name of ['verify', 'compatibility']) {
    assert.match(jobBlock(name), /^    timeout-minutes:\s*30\s*$/m, `${name} must be bounded`);
  }
});

test('superseded runs on the same ref are cancelled', () => {
  assert.match(workflow, /^concurrency:\n  group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true\s*$/m);
});

test('push and pull-request checks remain scoped to main and dev', () => {
  assert.match(workflow, /^on:\n  push:\n    branches: \[main, dev\]\n  pull_request:\n    branches: \[main, dev\]\s*$/m);
});

test('CI actions are pinned to reviewed immutable commit SHAs', () => {
  assert.equal(actionRefs.length, 4, 'expected checkout and setup-node in both jobs');
  for (const ref of actionRefs) {
    assert.match(ref, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/, `${ref} must use a full commit SHA`);
  }
  assert.deepEqual([...new Set(actionRefs)], [
    'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  ]);
});
