import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldSubmitComposerOnEnter} from '../lib/direct-composer-keys.ts';

const key=(overrides={})=>({
  key:'Enter',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,
  nativeEvent:{isComposing:false,keyCode:13},...overrides
});

test('group composer keeps touch Enter for a newline but supports explicit send',()=>{
  assert.equal(shouldSubmitComposerOnEnter(key(),true),false);
  assert.equal(shouldSubmitComposerOnEnter(key({ctrlKey:true}),true),true);
  assert.equal(shouldSubmitComposerOnEnter(key({metaKey:true}),true),true);
});

test('group composer preserves desktop Enter and Shift+Enter behavior',()=>{
  assert.equal(shouldSubmitComposerOnEnter(key(),false),true);
  assert.equal(shouldSubmitComposerOnEnter(key({shiftKey:true}),false),false);
  assert.equal(shouldSubmitComposerOnEnter(key({key:'a'}),false),false);
});

test('group composer never sends while an IME is composing, including keyCode 229 fallback',()=>{
  assert.equal(shouldSubmitComposerOnEnter(key({nativeEvent:{isComposing:true,keyCode:13}}),false),false);
  assert.equal(shouldSubmitComposerOnEnter(key({ctrlKey:true,nativeEvent:{isComposing:true}}),true),false);
  assert.equal(shouldSubmitComposerOnEnter(key({nativeEvent:{isComposing:false,keyCode:229}}),false),false);
  assert.equal(shouldSubmitComposerOnEnter(key({metaKey:true,nativeEvent:{keyCode:229}}),true),false);
});

test('Alt+Enter never submits a group message',()=>{
  assert.equal(shouldSubmitComposerOnEnter(key({altKey:true}),false),false);
  assert.equal(shouldSubmitComposerOnEnter(key({altKey:true,ctrlKey:true}),true),false);
});

test('group composer uses the shared IME-safe helper and detects hybrid touch devices',()=>{
  const panel=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');
  assert.match(panel,/import \{shouldSubmitComposerOnEnter\} from ['"]@\/lib\/direct-composer-keys['"]/);
  assert.match(panel,/navigator\.userAgent/);
  assert.match(panel,/\(any-pointer:coarse\)/);
  assert.match(panel,/shouldSubmitComposerOnEnter\(e,softKeyboard\)/);
  assert.doesNotMatch(panel,/sendKey=e\.ctrlKey\|\|e\.metaKey/);
});
