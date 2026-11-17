import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {clearGroupOfflineDraftError,GROUP_OFFLINE_DRAFT_ERROR} from '../lib/group-network.ts';

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


const groupPanel = readFileSync(new URL('../components/GroupPanel.tsx', import.meta.url), 'utf8');
const groupNetworkEffect = groupPanel.match(/useEffect\(\(\)=>\{\s*const update=\(\)=>setOnline\(navigator\.onLine\);[\s\S]*?\n \},\[\]\);/);

test('group composer refreshes connectivity after BFCache restore and PWA visibility changes', () => {
  assert.ok(groupNetworkEffect, 'the group network lifecycle effect should exist');
  const effect = groupNetworkEffect[0];
  assert.match(effect, /window\.addEventListener\('online',update\)/);
  assert.match(effect, /window\.addEventListener\('offline',update\)/);
  assert.match(effect, /window\.addEventListener\('pageshow',update\)/);
  assert.match(effect, /document\.addEventListener\('visibilitychange',update\)/);
});

test('reconnecting clears only the stale offline-draft error', () => {
  assert.equal(clearGroupOfflineDraftError(GROUP_OFFLINE_DRAFT_ERROR, true), '');
  assert.equal(clearGroupOfflineDraftError(GROUP_OFFLINE_DRAFT_ERROR, false), GROUP_OFFLINE_DRAFT_ERROR);
  assert.equal(clearGroupOfflineDraftError('Ошибка отправки · Черновик сохранён.', true), 'Ошибка отправки · Черновик сохранён.');
});

test('group composer clears the offline hint on connectivity recovery and reuses one message constant', () => {
  assert.match(groupNetworkEffect[0], /if\(connected\)setError\(current=>clearGroupOfflineDraftError\(current,connected\)\)/);
  assert.match(groupPanel, /setError\(GROUP_OFFLINE_DRAFT_ERROR\)/);
});

test('group network lifecycle listeners are removed when GroupPanel unmounts', () => {
  assert.ok(groupNetworkEffect, 'the group network lifecycle effect should exist');
  const effect = groupNetworkEffect[0];
  assert.match(effect, /window\.removeEventListener\('online',update\)/);
  assert.match(effect, /window\.removeEventListener\('offline',update\)/);
  assert.match(effect, /window\.removeEventListener\('pageshow',update\)/);
  assert.match(effect, /document\.removeEventListener\('visibilitychange',update\)/);
});
