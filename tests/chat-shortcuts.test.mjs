import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldOpenDirectChatSearch,shouldIgnoreGlobalChatShortcut} from '../lib/chat-shortcuts.ts';

const key=(overrides={})=>({
  key:'f',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,...overrides
});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Ctrl+F and Cmd+F search only inside an open private conversation',()=>{
  assert.equal(shouldOpenDirectChatSearch(key(),true),true);
  assert.equal(shouldOpenDirectChatSearch(key({ctrlKey:false,metaKey:true}),true),true);
  assert.equal(shouldOpenDirectChatSearch(key({key:'F'}),true),true);
  assert.equal(shouldOpenDirectChatSearch(key(),false),false);
});

test('native browser shortcuts and modified keys stay available',()=>{
  assert.equal(shouldOpenDirectChatSearch(key({ctrlKey:false}),true),false);
  assert.equal(shouldOpenDirectChatSearch(key({altKey:true}),true),false);
  assert.equal(shouldOpenDirectChatSearch(key({shiftKey:true}),true),false);
  assert.equal(shouldOpenDirectChatSearch(key({key:'k'}),true),false);
});

test('private chat header exposes an accessible search action with active state',()=>{
  const shell=source('components/AppShell.tsx');
  const css=source('app/globals.css');
  assert.match(shell,/shouldOpenDirectChatSearch\(event,directVisible\)/);
  assert.match(shell,/!selectedGroup&&!selectedChannel&&!profileTarget&&!selectedBot/);
  assert.match(shell,/className="ik-conversation-search-trigger"/);
  assert.match(shell,/aria-label="Поиск сообщений в переписке"/);
  assert.match(shell,/aria-pressed=\{searchInConversation\}/);
  assert.match(css,/\.ik-conversation-search-trigger:focus-visible/);
});

test('opened message search focuses its field and closes on Escape',()=>{
  const panel=source('components/DirectMessageSearchPanel.tsx');
  const shell=source('components/AppShell.tsx');
  assert.match(panel,/<input autoFocus aria-label="Поиск сообщений в текущем чате"/);
  assert.match(panel,/if\(event.key==='Escape'\)\{event.preventDefault\(\);event.stopPropagation\(\);onClose\(\);\}/);
  assert.match(shell,/input\?\.focus\(\);input\?\.select\(\)/);
});


test('global chat shortcuts ignore IME composition, Safari keyCode 229 and auto-repeat',()=>{
  assert.equal(shouldIgnoreGlobalChatShortcut({isComposing:true}),true);
  assert.equal(shouldIgnoreGlobalChatShortcut({keyCode:229}),true);
  assert.equal(shouldIgnoreGlobalChatShortcut({repeat:true}),true);
  assert.equal(shouldIgnoreGlobalChatShortcut({isComposing:false,repeat:false,keyCode:70}),false);
  assert.equal(shouldOpenDirectChatSearch(key({isComposing:true}),true),false);
  assert.equal(shouldOpenDirectChatSearch(key({keyCode:229}),true),false);
  assert.equal(shouldOpenDirectChatSearch(key({repeat:true}),true),false);
});

test('AppShell applies the IME/repeat guard before Ctrl+K, Ctrl+F and Escape handling',()=>{
  const shell=source('components/AppShell.tsx');
  const keyboard=shell.slice(shell.indexOf('const keyboard='),shell.indexOf("window.addEventListener('keydown',keyboard)"));
  const guard=keyboard.indexOf('if(shouldIgnoreGlobalChatShortcut(event))return;');
  assert.ok(guard>=0);
  assert.ok(guard<keyboard.indexOf('const shortcut='));
  assert.ok(guard<keyboard.indexOf('shouldOpenDirectChatSearch(event,directVisible)'));
  assert.ok(guard<keyboard.indexOf("event.key==='Escape'"));
});
