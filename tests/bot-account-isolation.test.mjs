import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {botPanelKey} from '../lib/bot-panel-key.ts';

const USER_A='11111111-1111-4111-8111-111111111111';
const USER_B='22222222-2222-4222-8222-222222222222';

test('bot panel identity changes when the signed-in account changes',()=>{
  assert.notEqual(botPanelKey(USER_A,'mood'),botPanelKey(USER_B,'mood'));
});

test('bot panel identity changes when the selected bot changes',()=>{
  assert.notEqual(botPanelKey(USER_A,'mood'),botPanelKey(USER_A,'days'));
});

test('AppShell keys the local-only bot component by both account and bot',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/import \{botPanelKey\} from ["']@\/lib\/bot-panel-key["'];/);
  assert.match(shell,/<BotsPanel key=\{botPanelKey\(userId,selectedBot\)\}/);
});
