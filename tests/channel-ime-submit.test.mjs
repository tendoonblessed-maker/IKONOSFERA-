import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldPreventImeFormSubmit} from '../lib/ime-form.ts';

const key=(overrides={})=>({
  key:'Enter',
  isComposing:false,
  keyCode:13,
  ...overrides
});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('normal Enter remains available to submit channel forms',()=>{
  assert.equal(shouldPreventImeFormSubmit(key()),false);
  assert.equal(shouldPreventImeFormSubmit(key({key:'a'})),false);
  assert.equal(shouldPreventImeFormSubmit(key({key:'Escape',isComposing:true})),false);
});

test('IME confirmation Enter is prevented while composition is active',()=>{
  assert.equal(shouldPreventImeFormSubmit(key({isComposing:true})),true);
});

test('Safari legacy keyCode 229 is protected even after isComposing becomes false',()=>{
  assert.equal(shouldPreventImeFormSubmit(key({isComposing:false,keyCode:229})),true);
});

test('both channel discussion and post-comment inputs guard IME confirmation',()=>{
  const panel=source('components/ChannelsPanel.tsx');
  assert.match(panel,/import \{shouldPreventImeFormSubmit\} from "@\/lib\/ime-form";/);
  assert.equal((panel.match(/shouldPreventImeFormSubmit\(e\.nativeEvent\)/g)||[]).length,2);
  assert.match(panel,/aria-label="Сообщение в обсуждении"/);
  assert.match(panel,/aria-label="Написать комментарий"/);
});


test('direct and group chat composers ignore IME confirmation Enter',()=>{
  const shell=source('components/AppShell.tsx');
  const group=source('components/GroupPanel.tsx');
  assert.ok(shell.includes('shouldPreventImeFormSubmit(e.nativeEvent)'));
  assert.ok(group.includes('shouldPreventImeFormSubmit(e.nativeEvent)'));
  assert.ok(shell.includes("if(e.key==='Enter'&&!e.shiftKey"));
  assert.ok(group.includes("if(e.key!=='Enter'||shouldPreventImeFormSubmit"));
});
