import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanChatDrafts,readChatDrafts,writeChatDrafts,updateChatDraftEntry} from '../lib/chat-drafts.ts';
import {cleanGroupDrafts,readGroupDrafts,writeGroupDraft} from '../lib/group-drafts.ts';

const USER='11111111-1111-4111-8111-111111111111';
const id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000000';
const data=new Map();
globalThis.window={sessionStorage:{
  getItem:key=>data.get(key)??null,
  setItem:(key,value)=>data.set(key,value),
  removeItem:key=>data.delete(key)
}};

test('direct chat drafts retain the newest 48 across writes and reloads',()=>{
  data.clear();
  let drafts={};
  for(let n=1;n<=50;n++)drafts=updateChatDraftEntry(drafts,id(n),'message '+n);
  writeChatDrafts(USER,drafts);
  const loaded=readChatDrafts(USER);
  assert.equal(Object.keys(loaded).length,48);
  assert.equal(loaded[id(1)],undefined);
  assert.equal(loaded[id(2)],undefined);
  assert.equal(loaded[id(50)],'message 50');
  // An edit to an older surviving conversation must make it recent again.
  drafts=updateChatDraftEntry(loaded,id(3),'edited');
  drafts=updateChatDraftEntry(drafts,id(51),'newest');
  assert.equal(drafts[id(3)],'edited');
  assert.equal(drafts[id(4)],undefined);
  assert.equal(drafts[id(51)],'newest');
  assert.equal(Object.keys(drafts).length,48);
});

test('direct draft normalization ignores malformed and empty keys before applying cap',()=>{
  const input={};
  for(let n=0;n<70;n++)input['bad-key-'+n]='invalid';
  input[id(1)]='First valid';
  input[id(2)]='   ';
  input[id(3)]='Last valid';
  assert.deepEqual(cleanChatDrafts(input),{[id(1)]:'First valid',[id(3)]:'Last valid'});
  assert.deepEqual(updateChatDraftEntry({[id(1)]:'hello'},'not-a-uuid','bad'),{[id(1)]:'hello'});
});

test('group drafts retain newly typed messages after reaching 48 conversations',()=>{
  data.clear();
  for(let n=1;n<=50;n++)writeGroupDraft(USER,id(n),'group '+n);
  let loaded=readGroupDrafts(USER);
  assert.equal(Object.keys(loaded).length,48);
  assert.equal(loaded[id(1)],undefined);
  assert.equal(loaded[id(2)],undefined);
  assert.equal(loaded[id(50)],'group 50');
  writeGroupDraft(USER,id(3),'updated old');
  writeGroupDraft(USER,id(51),'newest group');
  loaded=readGroupDrafts(USER);
  assert.equal(loaded[id(3)],'updated old');
  assert.equal(loaded[id(4)],undefined);
  assert.equal(loaded[id(51)],'newest group');
  assert.equal(Object.keys(loaded).length,48);
});

test('group draft normalization ignores malformed records ahead of valid drafts',()=>{
  const input={};
  for(let n=0;n<70;n++)input['not-a-group-'+n]='garbage';
  input[id(1)]='  Nice\n  ';
  input[id(2)]=' ';
  input[id(3)]='valid';
  assert.deepEqual(cleanGroupDrafts(input),{[id(1)]:'  Nice\n  ',[id(3)]:'valid'});
});
