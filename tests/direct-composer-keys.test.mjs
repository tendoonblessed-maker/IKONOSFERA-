import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldSubmitDirectComposerOnEnter} from '../lib/direct-composer-keys.ts';

const key=(overrides={})=>({
  key:'Enter',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,
  nativeEvent:{isComposing:false,keyCode:13},...overrides
});

test('touch devices keep plain Enter for multiline private messages',()=>{
  assert.equal(shouldSubmitDirectComposerOnEnter(key(),true),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({shiftKey:true}),true),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({ctrlKey:true}),true),true);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({metaKey:true}),true),true);
});

test('desktop keeps Enter to send, Shift+Enter to insert a newline',()=>{
  assert.equal(shouldSubmitDirectComposerOnEnter(key(),false),true);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({shiftKey:true}),false),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({key:'a'}),false),false);
});

test('composition never sends a private message, even with keyCode 229',()=>{
  assert.equal(shouldSubmitDirectComposerOnEnter(key({nativeEvent:{isComposing:true,keyCode:13}}),false),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({ctrlKey:true,nativeEvent:{isComposing:true}}),true),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({nativeEvent:{isComposing:false,keyCode:229}}),false),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({metaKey:true,nativeEvent:{keyCode:229}}),true),false);
});

test('Alt+Enter and other keys do not submit',()=>{
  assert.equal(shouldSubmitDirectComposerOnEnter(key({altKey:true}),false),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({altKey:true,ctrlKey:true}),true),false);
  assert.equal(shouldSubmitDirectComposerOnEnter(key({key:'Escape',ctrlKey:true}),true),false);
});

test('direct chat composer uses touch detection and only submits when permitted',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/import \{shouldSubmitDirectComposerOnEnter\} from ["']@\/lib\/direct-composer-keys["']/);
  assert.match(shell,/\(any-pointer:coarse\)/);
  assert.match(shell,/shouldSubmitDirectComposerOnEnter\(e,softKeyboard\)/);
  assert.match(shell,/if\(draft\.trim\(\)&&!sending\)e\.currentTarget\.form\?\.requestSubmit\(\)/);
});
