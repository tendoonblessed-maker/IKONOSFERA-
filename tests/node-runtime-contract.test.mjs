import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('declared Node engine matches Supabase runtime requirement', () => {
  assert.equal(packageJson.engines?.node, '>=22.0.0');
});

test('README documents the same minimum Node runtime as package metadata', () => {
  assert.match(readme, /Node\.js \*\*22 или новее\*\*/);
});

test('committed npm lockfile matches the package manifest', () => {
  assert.equal(packageLock.lockfileVersion, 3);
  assert.equal(packageLock.name, packageJson.name);
  assert.equal(packageLock.version, packageJson.version);

  const root = packageLock.packages?.[''];
  assert.ok(root, 'lockfile must contain root package metadata');
  assert.deepEqual(root.dependencies, packageJson.dependencies);
  assert.deepEqual(root.devDependencies, packageJson.devDependencies);
  assert.deepEqual(root.engines, packageJson.engines);
});

test('both CI jobs install from the committed lockfile with npm ci', () => {
  const ciSteps = workflow.match(/^\s+- run: npm ci --no-audit --no-fund$/gm) ?? [];
  assert.equal(ciSteps.length, 2, 'verify and Node compatibility jobs must use npm ci');
  assert.doesNotMatch(workflow, /npm install/);
});

test('CI tests the minimum supported Node runtime and builds on Node 24', () => {
  assert.match(workflow, /node-version: '24'/);
  assert.match(workflow, /matrix:\s*node-version:\s*\['22'\]/);
  assert.doesNotMatch(workflow, /node-version:\s*\['20',\s*'22'\]/);
});
