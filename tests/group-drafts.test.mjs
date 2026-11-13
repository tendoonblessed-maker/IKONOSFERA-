import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {cleanGroupDrafts,readGroupDrafts,writeGroupDraft,clearGroupDrafts} from '../lib/group-drafts.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const A='33333333-3333-4333-8333-333333333333';
const B='44444444-4444-4444-8444-444444444444';
const PREFIX='ikonosfera-group-drafts-tab-v1:';
const key=id=>PREFIX+id;
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const memory=new Map();
const store={
 getItem:key=>memory.get(key)??null,
 setItem:(key,value)=>memory.set(key,value),
 removeItem:key=>memory.delete(key)
};
globalThis.window={sessionStorage:store};
function reset(){
 clearGroupDrafts(OWNER);
 clearGroupDrafts(OTHER);
 memory.clear();
}

test('group drafts are isolated by both signed-in user and group ID',()=>{
 reset();
 writeGroupDraft(OWNER,A,'Привет');
 writeGroupDraft(OWNER,B,'Другое сообщение');
 writeGroupDraft(OTHER,A,'Чужой текст');
 assert.equal(readGroupDrafts(OWNER)[A],'Привет');
 assert.equal(readGroupDrafts(OWNER)[B],'Другое сообщение');
 assert.equal(readGroupDrafts(OTHER)[A],'Чужой текст');
 writeGroupDraft(OWNER,A,'');
 assert.equal(readGroupDrafts(OWNER)[A],undefined);
 assert.equal(readGroupDrafts(OTHER)[A],'Чужой текст');
});

test('group drafts retain intentional whitespace, cap message length and discard malformed IDs',()=>{
 reset();
 const text='  первая строка\nвторая  ';
 writeGroupDraft(OWNER,A,text);
 assert.equal(readGroupDrafts(OWNER)[A],text);
 writeGroupDraft(OWNER,A,'x'.repeat(5000));
 assert.equal(readGroupDrafts(OWNER)[A].length,4000);
 assert.deepEqual(cleanGroupDrafts({bad:'no', [A]:' ',[B]:'okay'}),{[B]:'okay'});
 assert.deepEqual(cleanGroupDrafts(null),{});
 assert.deepEqual(cleanGroupDrafts([]),{});
});

test('logging out clears only the previous account group drafts',()=>{
 reset();
 writeGroupDraft(OWNER,A,'Secret');
 writeGroupDraft(OTHER,A,'Other');
 clearGroupDrafts(OWNER);
 assert.deepEqual(readGroupDrafts(OWNER),{});
 assert.equal(readGroupDrafts(OTHER)[A],'Other');
});

test('storage errors keep the latest group draft readable in this tab',()=>{
 reset();
 const original=globalThis.window;
 try{
  Object.defineProperty(globalThis,'window',{
   configurable:true,
   value:{get sessionStorage(){throw Error('private-mode storage disabled');}}
  });
  assert.doesNotThrow(()=>writeGroupDraft(OWNER,A,'Keep typing'));
  assert.equal(readGroupDrafts(OWNER)[A],'Keep typing');
  assert.doesNotThrow(()=>clearGroupDrafts(OWNER));
  assert.deepEqual(readGroupDrafts(OWNER),{});
 }finally{
  Object.defineProperty(globalThis,'window',{configurable:true,value:original});
  reset();
 }
 assert.deepEqual(writeGroupDraft('not-uuid',A,'wrong'),{});
});

test('failed group draft writes flush the newest snapshot after storage recovers',()=>{
 reset();
 const original=globalThis.window;
 const values=new Map();
 let blocked=false;
 try{
  globalThis.window={sessionStorage:{
   getItem:id=>values.get(id)??null,
   setItem(id,value){if(blocked)throw Error('quota');values.set(id,String(value));},
   removeItem(id){if(blocked)throw Error('quota');values.delete(id);}
  }};
  writeGroupDraft(OWNER,A,'Old draft');
  blocked=true;
  writeGroupDraft(OWNER,A,'Latest draft');
  writeGroupDraft(OWNER,B,'Second draft');
  assert.deepEqual(readGroupDrafts(OWNER),{[A]:'Latest draft',[B]:'Second draft'});
  assert.equal(JSON.parse(values.get(key(OWNER)))[A],'Old draft','stale storage remains untouched while blocked');
  blocked=false;
  assert.deepEqual(readGroupDrafts(OWNER),{[A]:'Latest draft',[B]:'Second draft'});
  assert.deepEqual(JSON.parse(values.get(key(OWNER))),{[A]:'Latest draft',[B]:'Second draft'});
 }finally{
  globalThis.window=original;
  reset();
 }
});

test('failed group draft logout removal cannot resurrect private text',()=>{
 reset();
 const original=globalThis.window;
 const values=new Map();
 let blocked=false;
 try{
  globalThis.window={sessionStorage:{
   getItem:id=>values.get(id)??null,
   setItem(id,value){if(blocked)throw Error('blocked');values.set(id,String(value));},
   removeItem(id){if(blocked)throw Error('blocked');values.delete(id);}
  }};
  writeGroupDraft(OWNER,A,'Private group draft');
  blocked=true;
  clearGroupDrafts(OWNER);
  assert.deepEqual(readGroupDrafts(OWNER),{});
  assert.ok(values.has(key(OWNER)),'old bytes remain physically stored while removal is blocked');
  blocked=false;
  assert.deepEqual(readGroupDrafts(OWNER),{});
  assert.equal(values.has(key(OWNER)),false,'pending logout tombstone removes stale storage after recovery');
 }finally{
  globalThis.window=original;
  reset();
 }
});

test('disabled sessionStorage keeps separate in-tab snapshots for each account',()=>{
 reset();
 const original=globalThis.window;
 try{
  globalThis.window={get sessionStorage(){throw Error('storage disabled');}};
  writeGroupDraft(OWNER,A,'Alice draft');
  writeGroupDraft(OTHER,A,'Bob draft');
  assert.equal(readGroupDrafts(OWNER)[A],'Alice draft');
  assert.equal(readGroupDrafts(OTHER)[A],'Bob draft');
  clearGroupDrafts(OWNER);
  assert.deepEqual(readGroupDrafts(OWNER),{});
  assert.equal(readGroupDrafts(OTHER)[A],'Bob draft');
 }finally{
  globalThis.window=original;
  reset();
 }
});

test('group composer preserves a more recent edit after an in-flight send',()=>{
 const source=load('components/GroupPanel.tsx');
 assert.match(source,/const sentDraftVersion=draftVersionRef\.current/);
 assert.match(source,/if\(draftVersionRef\.current===sentDraftVersion\)\{/);
 assert.match(source,/draftVersionRef\.current\+=1/);
 assert.match(source,/onDraftChange\(groupId,''\)/);
 assert.match(source,/onDraftChange\(group\.id,text\)/);
 assert.match(source,/setDraft\(readGroupDrafts\(userId\)\[group\.id\]\?\?''\)/);
 assert.doesNotMatch(source,/setDraft\(current=>current\.trim\(\)===body\?'':current\)/);
});

test('group messages are not sent on reconnect, and stay in drafts after failed send',()=>{
 const group=load('components/GroupPanel.tsx');
 assert.match(group,/if\(!online\|\|!navigator\.onLine\)\{/);
 assert.match(group,/Сообщение осталось в черновике/);
 assert.match(group,/Черновик сохранён/);
 assert.match(group,/disabled=\{busy\|\|!draft\.trim\(\)\|\|!online\}/);
 assert.match(group,/window\.addEventListener\('online',update\)/);
 assert.match(group,/window\.addEventListener\('offline',update\)/);
 const errorBranch=group.slice(group.indexOf('}catch(e){\n   setError((e instanceof Error?e.message'),group.indexOf(' const names='));
 assert.doesNotMatch(errorBranch,/onDraftChange\(groupId,''\)/);
});

test('group drafts appear in inbox and get cleared on sign-out',()=>{
 const shell=load('components/AppShell.tsx');
 const row=load('components/GroupInboxRow.tsx');
 const css=load('app/globals.css');
 assert.match(shell,/readGroupDrafts\(userId\)/);
 assert.match(shell,/writeGroupDraft\(userId,groupId,text\)/);
 assert.match(shell,/clearGroupDrafts\(userId\)/);
 assert.match(shell,/onDraftChange=\{updateGroupDraft\}/);
 assert.match(shell,/draft=\{groupDraftPreviews\[item\.group\.id\]\}/);
 assert.match(row,/ik-group-draft-label/);
 assert.match(row,/Черновик:/);
 assert.match(css,/\.ik-group-inbox-text small/);
});

test('group multiline composer supports Shift+Enter and prevents iOS input zoom',()=>{
 const group=load('components/GroupPanel.tsx');
 const css=load('app/globals.css');
 assert.match(group,/<textarea aria-label="Сообщение группе"/);
 assert.match(group,/e\.nativeEvent\.isComposing/);
 assert.match(group,/e\.ctrlKey\|\|e\.metaKey\|\|\(!e\.shiftKey&&window\.matchMedia/);
 assert.match(group,/e\.currentTarget\.form\?\.requestSubmit\(\)/);
 assert.match(css,/\.group-view \.ik-group-composer textarea/);
 assert.match(css,/font-size:16px/);
});
