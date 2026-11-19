import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');

test('declared Node engine matches Supabase runtime requirement', () => {
  assert.equal(packageJson.engines?.node, '>=22.0.0');
});

test('CI tests the minimum supported Node runtime and builds on Node 24', () => {
  assert.match(workflow, /node-version: '24'/);
  assert.match(workflow, /matrix:\s*node-version:\s*\['22'\]/);
  assert.doesNotMatch(workflow, /node-version:\s*\['20',\s*'22'\]/);
});
