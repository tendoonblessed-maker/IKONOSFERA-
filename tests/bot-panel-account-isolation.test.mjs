import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { botPanelInstanceKey } from '../lib/bot-panel-instance-key.mjs';

const load=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('bot panel key isolates transient state by account and bot',()=>{
  const first=botPanelInstanceKey('user-a','mood');
  assert.equal(first,botPanelInstanceKey('user-a','mood'));
  assert.notEqual(first,botPanelInstanceKey('user-b','mood'));
  assert.notEqual(first,botPanelInstanceKey('user-a','days'));
});

test('AppShell keys BotsPanel so account or bot changes remount its local state',()=>{
  const shell=load('components/AppShell.tsx');
  assert.match(shell,/key=\{botPanelInstanceKey\(userId,selectedBot\)\}/);
  assert.match(shell,/import \{ botPanelInstanceKey \} from ['"]@\/lib\/bot-panel-instance-key\.mjs['"]/);
});
