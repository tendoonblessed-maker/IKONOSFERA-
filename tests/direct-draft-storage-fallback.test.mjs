import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readChatDrafts,writeChatDrafts,clearChatDrafts} from '../lib/chat-drafts.ts';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const CHAT='33333333-3333-4333-8333-333333333333';
const key=id=>'ikonosfera-drafts-tab-v1:'+id;

test('direct drafts keep newest text while writes fail and flush after recovery',()=>{
  const values=new Map();
  let blocked=false;
  globalThis.window={sessionStorage:{
    getItem:id=>values.get(id)??null,
    setItem(id,value){if(blocked)throw Error('quota');values.set(id,value);},
    removeItem(id){if(blocked)throw Error('quota');values.delete(id);}
  }};
  writeChatDrafts(A,{[CHAT]:'Old draft'});
  blocked=true;
  writeChatDrafts(A,{[CHAT]:'Latest draft'});
  assert.equal(readChatDrafts(A)[CHAT],'Latest draft','stale storage must not replace the latest edit');
  blocked=false;
  assert.equal(readChatDrafts(A)[CHAT],'Latest draft');
  assert.equal(JSON.parse(values.get(key(A)))[CHAT],'Latest draft');
  clearChatDrafts(A);
});

test('failed logout removal cannot resurrect a previous account draft',()=>{
  const values=new Map();
  let blocked=false;
  globalThis.window={sessionStorage:{
    getItem:id=>values.get(id)??null,
    setItem(id,value){if(blocked)throw Error('blocked');values.set(id,value);},
    removeItem(id){if(blocked)throw Error('blocked');values.delete(id);}
  }};
  writeChatDrafts(A,{[CHAT]:'Private draft'});
  blocked=true;
  clearChatDrafts(A);
  assert.deepEqual(readChatDrafts(A),{});
  assert.ok(values.has(key(A)),'the old value is still physically stored while removal is blocked');
  blocked=false;
  assert.deepEqual(readChatDrafts(A),{});
  assert.equal(values.has(key(A)),false,'pending deletion is retried when storage recovers');
});

test('disabled sessionStorage getter preserves only the correct account drafts',()=>{
  const previous=globalThis.window;
  try{
    globalThis.window={get sessionStorage(){throw Error('disabled');}};
    writeChatDrafts(A,{[CHAT]:'Alice'});
    writeChatDrafts(B,{[CHAT]:'Bob'});
    assert.equal(readChatDrafts(A)[CHAT],'Alice');
    assert.equal(readChatDrafts(B)[CHAT],'Bob');
    clearChatDrafts(A);
    assert.deepEqual(readChatDrafts(A),{});
    assert.equal(readChatDrafts(B)[CHAT],'Bob');
    assert.deepEqual(readChatDrafts('not-a-uuid'),{});
  }finally{
    globalThis.window=previous;
    clearChatDrafts(A);
    clearChatDrafts(B);
  }
});

test('corrupt or invalid direct-draft snapshots preserve last-known-good memory, while valid empty clears',()=>{
  const previous=globalThis.window;
  const values=new Map();
  globalThis.window={sessionStorage:{
    getItem:id=>values.get(id)??null,
    setItem:(id,value)=>values.set(id,value),
    removeItem:id=>values.delete(id)
  }};
  try{
    writeChatDrafts(A,{[CHAT]:'Last known good'});
    const invalidSnapshots=[
      '{',
      'null',
      '[]',
      '"not an object"',
      '{"not-a-uuid":"stale"}',
      '{"33333333-3333-4333-8333-333333333333":"   "}'
    ];
    for(const snapshot of invalidSnapshots){
      values.set(key(A),snapshot);
      assert.equal(readChatDrafts(A)[CHAT],'Last known good',`snapshot ${snapshot} must not erase the in-tab copy`);
    }
    values.set(key(A),'{}');
    assert.deepEqual(readChatDrafts(A),{},'a valid empty object is an intentional clear');
    writeChatDrafts(A,{[CHAT]:'Remove me'});
    values.delete(key(A));
    assert.deepEqual(readChatDrafts(A),{},'a successfully removed key must not resurrect an old in-memory draft');
  }finally{
    clearChatDrafts(A);
    globalThis.window=previous;
  }
});
