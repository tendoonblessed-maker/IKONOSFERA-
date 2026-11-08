import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldSubmitGroupMessage} from '../lib/group-composer-shortcut.ts';

const event=(overrides={})=>({
  key:'Enter',
  isComposing:false,
  keyCode:13,
  repeat:false,
  ctrlKey:false,
  metaKey:false,
  shiftKey:false,
  ...overrides
});
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('desktop Enter submits while Shift+Enter keeps a newline',()=>{
  assert.equal(shouldSubmitGroupMessage(event(),true),true);
  assert.equal(shouldSubmitGroupMessage(event({shiftKey:true}),true),false);
  assert.equal(shouldSubmitGroupMessage(event({key:'a'}),true),false);
});

test('mobile Enter inserts a newline and Ctrl/Cmd+Enter submits',()=>{
  assert.equal(shouldSubmitGroupMessage(event(),false),false);
  assert.equal(shouldSubmitGroupMessage(event({ctrlKey:true}),false),true);
  assert.equal(shouldSubmitGroupMessage(event({metaKey:true}),false),true);
});

test('IME composition and Safari legacy keyCode 229 never submit',()=>{
  assert.equal(shouldSubmitGroupMessage(event({isComposing:true,ctrlKey:true}),true),false);
  assert.equal(shouldSubmitGroupMessage(event({isComposing:false,keyCode:229,ctrlKey:true}),true),false);
  assert.equal(shouldSubmitGroupMessage(event({keyCode:229}),false),false);
});

test('held Enter key repeat never submits a second time',()=>{
  assert.equal(shouldSubmitGroupMessage(event({repeat:true}),true),false);
  assert.equal(shouldSubmitGroupMessage(event({repeat:true,ctrlKey:true}),false),false);
});

test('GroupPanel delegates Enter handling to the tested IME-safe helper',()=>{
  const panel=load('components/GroupPanel.tsx');
  assert.match(panel,/shouldSubmitGroupMessage\(e\.nativeEvent,window\.matchMedia\('\(pointer:fine\)'\)\.matches\)/);
  assert.match(panel,/e\.preventDefault\(\);e\.currentTarget\.form\?\.requestSubmit\(\)/);
});
