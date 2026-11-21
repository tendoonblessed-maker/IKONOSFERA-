import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
  createMobileDetailHistoryState,
  MOBILE_DETAIL_HISTORY_KEY,
  readMobileDetailHistorySnapshot
} from '../lib/mobile-detail-history.ts';

const CHAT='11111111-1111-4111-8111-111111111111';
const GROUP='22222222-2222-4222-8222-222222222222';
const CHANNEL='33333333-3333-4333-8333-333333333333';
const PROFILE='44444444-4444-4444-8444-444444444444';
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_OWNER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const snapshot = {
  ownerId: OWNER,
  tab: 'chats',
  selectedChatId: CHAT,
  selectedGroupId: null,
  selectedChannelId: null,
  profileTargetId: null,
  selectedBot: null
};

test('mobile detail history preserves Next.js-owned state and round-trips view identifiers', () => {
  const current = { __NA: true, tree: ['root'], customRouterFlag: 7 };
  const next = createMobileDetailHistoryState(current, snapshot);

  assert.equal(next.__NA, true);
  assert.deepEqual(next.tree, ['root']);
  assert.equal(next.customRouterFlag, 7);
  assert.deepEqual(readMobileDetailHistorySnapshot(next,OWNER), snapshot);
});

test('mobile detail history accepts group, channel, profile and bot snapshots', () => {
  const cases = [
    { ...snapshot, selectedChatId: null, selectedGroupId: GROUP },
    { ...snapshot, selectedChatId: null, selectedChannelId: CHANNEL, tab: 'channels' },
    { ...snapshot, selectedChatId: null, profileTargetId: PROFILE },
    { ...snapshot, selectedChatId: null, selectedBot: 'mood' }
  ];

  for (const value of cases) {
    assert.deepEqual(
      readMobileDetailHistorySnapshot(createMobileDetailHistoryState(null, value),OWNER),
      value
    );
  }
});

test('mobile detail history rejects malformed, unrelated or inconsistent browser state', () => {
  assert.equal(readMobileDetailHistorySnapshot(null,OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({ __NA: true },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({ [MOBILE_DETAIL_HISTORY_KEY]: [] },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, tab: 'admin' }
  },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedChatId: 42 }
  },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedBot: 'unknown' }
  },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedChatId: 'chat-123' }
  },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedChannelId: 'not-a-uuid', selectedChatId: null }
  },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedGroupId: GROUP }
  },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedChatId: null }
  },OWNER), null);
  assert.equal(readMobileDetailHistorySnapshot(createMobileDetailHistoryState(null,snapshot),OTHER_OWNER),null);
  assert.equal(readMobileDetailHistorySnapshot(createMobileDetailHistoryState(null,snapshot),''),null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, ownerId: 'not-a-uuid' }
  },OWNER),null);
  const legacy={...snapshot};delete legacy.ownerId;
  assert.equal(readMobileDetailHistorySnapshot({[MOBILE_DETAIL_HISTORY_KEY]:legacy},OWNER),null);
});

test('history snapshots contain identifiers only, never drafts or message content', () => {
  const saved = readMobileDetailHistorySnapshot(createMobileDetailHistoryState(null, snapshot),OWNER);
  assert.deepEqual(Object.keys(saved ?? {}).sort(), [
    'profileTargetId',
    'selectedBot',
    'selectedChannelId',
    'selectedChatId',
    'selectedGroupId',
    'tab'
  ]);
  assert.equal('draft' in (saved ?? {}), false);
  assert.equal('messages' in (saved ?? {}), false);
  assert.equal('ownerId' in (saved ?? {}), true);
});

test('AppShell integration assertions match the actual navigation handlers', () => {
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /createMobileDetailHistoryState/);
  assert.match(shell, /readMobileDetailHistorySnapshot\(event\.state,loggedIn\?userId:''\)/);
  assert.match(shell, /ownerId:userId/);
  assert.match(shell, /window\.addEventListener\('popstate'/);
  assert.match(shell, /window\.history\.pushState\(/);
  assert.match(shell, /window\.history\.replaceState\(/);
  assert.match(shell, /else if\(isMobile&&mobileDetailOpen&&mobileDetailHistoryRef\.current\)/);
  assert.match(shell, /window\.history\.back\(\)/);
  assert.match(shell, /matchMedia\('\(max-width: 800px\)'\)/);
});

test('updated detail snapshot replaces the existing entry without losing framework state', () => {
  const frameworkState = { __NA: true, tree: ['root'], customRouterFlag: 7 };
  const first = createMobileDetailHistoryState(frameworkState, snapshot);
  const latest = { ...snapshot, selectedChatId: null, selectedGroupId: GROUP };
  const replaced = createMobileDetailHistoryState(first, latest);

  assert.equal(replaced.__NA, true);
  assert.deepEqual(replaced.tree, ['root']);
  assert.equal(replaced.customRouterFlag, 7);
  assert.deepEqual(readMobileDetailHistorySnapshot(replaced), latest);
});
