import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldOpenDirectChatSearch} from '../lib/chat-shortcuts.ts';

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


const composerKey=(overrides={})=>({
  key:'Enter',shiftKey:false,repeat:false,isComposing:false,keyCode:13,...overrides
});

test('direct composer sends desktop Enter but preserves Shift+Enter and soft-keyboard newlines',async()=>{
  const {shouldSubmitDirectMessage}=await import('../lib/chat-shortcuts.ts');
  assert.equal(shouldSubmitDirectMessage(composerKey(),false),true);
  assert.equal(shouldSubmitDirectMessage(composerKey({shiftKey:true}),false),false);
  assert.equal(shouldSubmitDirectMessage(composerKey(),true),false);
  assert.equal(shouldSubmitDirectMessage(composerKey({key:'a'}),false),false);
});

test('direct composer never sends an IME confirmation key, including Safari keyCode 229',async()=>{
  const {shouldSubmitDirectMessage}=await import('../lib/chat-shortcuts.ts');
  assert.equal(shouldSubmitDirectMessage(composerKey({isComposing:true}),false),false);
  assert.equal(shouldSubmitDirectMessage(composerKey({isComposing:false,keyCode:229}),false),false);
  assert.equal(shouldSubmitDirectMessage(composerKey({isComposing:true,keyCode:229}),false),false);
});

test('direct composer ignores held Enter key repeats',async()=>{
  const {shouldSubmitDirectMessage}=await import('../lib/chat-shortcuts.ts');
  assert.equal(shouldSubmitDirectMessage(composerKey({repeat:true}),false),false);
  assert.equal(shouldSubmitDirectMessage(composerKey({repeat:true,keyCode:229}),false),false);
});

test('AppShell uses the tested IME-safe direct composer decision',()=>{
  const shell=source('components/AppShell.tsx');
  assert.match(shell,/shouldSubmitDirectMessage\(e\.nativeEvent,softKeyboard\)/);
  assert.doesNotMatch(shell,/!e\.nativeEvent\.isComposing&&!softKeyboard/);
});
