import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const appShell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
const groupPanel=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');

test('direct composer is remounted for every account and conversation',()=>{
  assert.match(appShell,/<textarea key=\{userId\+':'\+selected\} ref=\{composerRef\}/);
  assert.match(appShell,/draftScopeRef\.current\.ownerId!==userId\|\|draftScopeRef\.current\.chatId!==selected\)return;/);
});

test('group composer is remounted for every account and group',()=>{
  assert.match(groupPanel,/<textarea key=\{userId\+':'\+group\.id\} aria-label="Сообщение группе"/);
  assert.match(groupPanel,/draftScopeRef\.current\.ownerId!==userId\|\|draftScopeRef\.current\.groupId!==group\.id\)return;/);
});

test('both composers keep Enter non-sending while an IME composition is active',()=>{
  assert.match(appShell,/e\.key==='Enter'&&!e\.shiftKey&&!e\.nativeEvent\.isComposing/);
  assert.match(groupPanel,/if\(e\.key!=='Enter'\|\|e\.nativeEvent\.isComposing\)return/);
});
