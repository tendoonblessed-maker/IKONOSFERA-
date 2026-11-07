import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
const networkEffect = shell.match(/useEffect\(\(\)=>\{\s*\/\/ Browser online\/offline[\s\S]*?\n  \},\[\]\);/);

test('network hint refreshes when a mobile app returns to the foreground', () => {
  assert.ok(networkEffect, 'the network lifecycle effect should exist');
  const effect = networkEffect[0];
  assert.match(effect, /const connected=navigator\.onLine/);
  assert.match(effect, /setNetworkOnline\(connected\)/);
  assert.match(effect, /window\.addEventListener\('online',update\)/);
  assert.match(effect, /window\.addEventListener\('offline',update\)/);
  assert.match(effect, /window\.addEventListener\('pageshow',update\)/);
  assert.match(effect, /document\.addEventListener\('visibilitychange',update\)/);
});

test('all network lifecycle listeners are removed when the app shell unmounts', () => {
  assert.ok(networkEffect, 'the network lifecycle effect should exist');
  const effect = networkEffect[0];
  assert.match(effect, /window\.removeEventListener\('online',update\)/);
  assert.match(effect, /window\.removeEventListener\('offline',update\)/);
  assert.match(effect, /window\.removeEventListener\('pageshow',update\)/);
  assert.match(effect, /document\.removeEventListener\('visibilitychange',update\)/);
});
