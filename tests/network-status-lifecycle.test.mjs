import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {clearGroupOfflineDraftError,GROUP_OFFLINE_DRAFT_ERROR} from '../lib/group-network.ts';
import {clearDirectOfflineHint,DIRECT_MESSAGE_OFFLINE_ERROR,DIRECT_ATTACHMENT_OFFLINE_ERROR} from '../lib/direct-network.ts';

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
const groupNetworkEffect = groupPanel.match(/useEffect\(\(\)=>\{\s*const update=\(\)=>\{[\s\S]*?navigator\.onLine[\s\S]*?\n \},\[\]\);/);

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


test('direct reconnect clears only the exact local message and attachment offline hints', () => {
  assert.equal(clearDirectOfflineHint(DIRECT_MESSAGE_OFFLINE_ERROR, true), '');
  assert.equal(clearDirectOfflineHint(DIRECT_ATTACHMENT_OFFLINE_ERROR, true), '');
  assert.equal(clearDirectOfflineHint(DIRECT_MESSAGE_OFFLINE_ERROR, false), DIRECT_MESSAGE_OFFLINE_ERROR);
  assert.equal(clearDirectOfflineHint(DIRECT_ATTACHMENT_OFFLINE_ERROR, false), DIRECT_ATTACHMENT_OFFLINE_ERROR);
  assert.equal(clearDirectOfflineHint('Нет соединения с интернетом. Ошибка сервера.', true), 'Нет соединения с интернетом. Ошибка сервера.');
  assert.equal(clearDirectOfflineHint(DIRECT_MESSAGE_OFFLINE_ERROR + ' Дополнительная информация.', true), DIRECT_MESSAGE_OFFLINE_ERROR + ' Дополнительная информация.');
  assert.equal(clearDirectOfflineHint('Ошибка отправки сообщения.', true), 'Ошибка отправки сообщения.');
});

test('AppShell uses shared exact-match direct offline hints instead of clearing by prefix', () => {
  assert.match(networkEffect[0], /clearDirectOfflineHint\(previous,connected\)/);
  assert.doesNotMatch(networkEffect[0], /startsWith\('Нет соединения с интернетом\.'\)/);
  assert.match(shell, /setError\(DIRECT_MESSAGE_OFFLINE_ERROR\)/);
  assert.match(shell, /setError\(DIRECT_ATTACHMENT_OFFLINE_ERROR\)/);
});

test('group composer starts offline-safe until browser connectivity is measured', () => {
  assert.match(groupPanel, /const \\[online,setOnline\\]=useState\\(false\\)/);
  assert.match(groupNetworkEffect[0], /const connected=navigator\\.onLine/);
  assert.match(groupPanel, /if\\(!online\\|\\|!navigator\\.onLine\\)\\{setError\\(GROUP_OFFLINE_DRAFT_ERROR\\);return;\\}/);
  assert.match(groupPanel, /disabled=\\{busy\\|\\|!draft\\.trim\\(\\)\\|\\|!online\\}/);
});
