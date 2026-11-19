import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');

test('CI workflow grants only read access to repository contents', () => {
  const permissions = workflow.match(/^permissions:\n((?:  [^\n]+\n)+)/m)?.[1];
  assert.ok(permissions, 'workflow-level permissions must be explicit');
  assert.match(permissions, /^  contents:\s*read\s*$/m);
  assert.doesNotMatch(permissions, /\bwrite\b/);
});

test('verify job has a finite runner timeout', () => {
  const lines = workflow.split('\n');
  const start = lines.indexOf('  verify:');
  assert.notEqual(start, -1, 'verify job must exist');
  const end = lines.findIndex((line, index) => index > start && /^  [a-zA-Z0-9_-]+:$/.test(line));
  const verify = lines.slice(start + 1, end === -1 ? lines.length : end).join('\n');
  assert.match(verify, /^    timeout-minutes:\s*30\s*$/m);
});

test('CI still validates pull requests', () => {
  assert.match(workflow, /^  pull_request:\s*$/m);
});
