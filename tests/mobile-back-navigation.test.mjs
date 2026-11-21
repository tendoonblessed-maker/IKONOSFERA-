import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
  createMobileDetailHistoryState,
  MOBILE_DETAIL_HISTORY_KEY,
  readMobileDetailHistorySnapshot
} from '../lib/mobile-detail-history.ts';

const snapshot = {
  tab: 'chats',
  selectedChatId: 'chat-123',
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
  assert.deepEqual(readMobileDetailHistorySnapshot(next), snapshot);
});

test('mobile detail history accepts group, channel, profile and bot snapshots', () => {
  const cases = [
    { ...snapshot, selectedChatId: null, selectedGroupId: 'group-1' },
    { ...snapshot, selectedChatId: null, selectedChannelId: 'channel-1', tab: 'channels' },
    { ...snapshot, selectedChatId: null, profileTargetId: 'profile-1' },
    { ...snapshot, selectedChatId: null, selectedBot: 'mood' }
  ];

  for (const value of cases) {
    assert.deepEqual(
      readMobileDetailHistorySnapshot(createMobileDetailHistoryState(null, value)),
      value
    );
  }
});

test('mobile detail history rejects malformed or unrelated browser state', () => {
  assert.equal(readMobileDetailHistorySnapshot(null), null);
  assert.equal(readMobileDetailHistorySnapshot({ __NA: true }), null);
  assert.equal(readMobileDetailHistorySnapshot({ [MOBILE_DETAIL_HISTORY_KEY]: [] }), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, tab: 'admin' }
  }), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedChatId: 42 }
  }), null);
  assert.equal(readMobileDetailHistorySnapshot({
    [MOBILE_DETAIL_HISTORY_KEY]: { ...snapshot, selectedBot: 'unknown' }
  }), null);
});

test('history snapshots contain identifiers only, never drafts or message content', () => {
  const saved = readMobileDetailHistorySnapshot(createMobileDetailHistoryState(null, snapshot));
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
});

test('AppShell integrates mobile-only popstate handling without storing chat content', () => {
  const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /createMobileDetailHistoryState/);
  assert.match(shell, /readMobileDetailHistorySnapshot/);
  assert.match(shell, /window\.addEventListener\('popstate'/);
  assert.match(shell, /window\.history\.pushState\(/);
  assert.match(shell, /window\.history\.back\(\)/);
  assert.match(shell, /matchMedia\('\(max-width: 800px\)'\)/);
});
