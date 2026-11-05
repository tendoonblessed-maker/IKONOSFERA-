import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readGroupDrafts,writeGroupDraft,clearGroupDrafts} from '../lib/group-drafts.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const A='33333333-3333-4333-8333-333333333333';
const B='44444444-4444-4444-8444-444444444444';
const memory=new Map();
let writable=true;
let removable=true;
const storage={
 getItem:key=>memory.get(key)??null,
 setItem:(key,value)=>{if(!writable)throw Error('quota exceeded');memory.set(key,value);},
 removeItem:key=>{if(!removable)throw Error('storage denied');memory.delete(key);}
};
globalThis.window={sessionStorage:storage};
const storageKey='ikonosfera-group-drafts-tab-v1:'+OWNER;
function reset(){
 writable=true;removable=true;
 clearGroupDrafts(OWNER);clearGroupDrafts(OTHER);
 memory.clear();
}

test('blocked storage writes retain multiple group drafts in the current tab',()=>{
 reset();writable=false;
 writeGroupDraft(OWNER,A,'Первый черновик');
 writeGroupDraft(OWNER,B,'Второй черновик');
 assert.deepEqual(readGroupDrafts(OWNER),{[A]:'Первый черновик',[B]:'Второй черновик'});
 assert.deepEqual(readGroupDrafts(OTHER),{});
 assert.equal(memory.size,0);
 reset();
});

test('after storage recovers, the next edit persists all pending group drafts',()=>{
 reset();writable=false;
 writeGroupDraft(OWNER,A,'Не потерять');
 writable=true;
 writeGroupDraft(OWNER,B,'После восстановления');
 const persisted=JSON.parse(memory.get(storageKey));
 assert.deepEqual(persisted,{[A]:'Не потерять',[B]:'После восстановления'});
 assert.deepEqual(readGroupDrafts(OWNER),persisted);
 reset();
});

test('a read after storage recovery flushes pending drafts without another edit',()=>{
 reset();writable=false;
 writeGroupDraft(OWNER,A,'Первый черновик');
 writeGroupDraft(OWNER,B,'Второй черновик');
 writable=true;
 assert.deepEqual(readGroupDrafts(OWNER),{[A]:'Первый черновик',[B]:'Второй черновик'});
 assert.deepEqual(JSON.parse(memory.get(storageKey)),{[A]:'Первый черновик',[B]:'Второй черновик'});
 reset();
});

test('failed sign-out removal cannot revive a previous account draft',()=>{
 reset();writeGroupDraft(OWNER,A,'Личный черновик');
 removable=false;
 clearGroupDrafts(OWNER);
 assert.deepEqual(readGroupDrafts(OWNER),{});
 assert.ok(memory.has(storageKey),'the old value is still physically stored while removal is blocked');
 removable=true;
 assert.deepEqual(readGroupDrafts(OWNER),{},'the in-tab tombstone still hides the old draft');
 assert.equal(memory.has(storageKey),false,'a read after recovery must flush the pending deletion');
 writeGroupDraft(OWNER,B,'Новый черновик');
 assert.deepEqual(readGroupDrafts(OWNER),{[B]:'Новый черновик'});
 reset();
});
