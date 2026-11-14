import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readChatDrafts,writeChatDrafts,clearChatDrafts,cleanChatDrafts,updateChatDraftEntry} from '../lib/chat-drafts.ts';

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

test('direct draft truncation never cuts a family emoji, flag or combining grapheme',()=>{
  const cases=[
    ['x'.repeat(3990)+'👨‍👩‍👧‍👦tail','x'.repeat(3990)],
    ['x'.repeat(3998)+'🇸🇪tail','x'.repeat(3998)],
    ['x'.repeat(3999)+'e\u0301tail','x'.repeat(3999)],
    ['x'.repeat(3999)+'😀tail','x'.repeat(3999)]
  ];
  for(const [input,expected] of cases){
    const cleaned=cleanChatDrafts({[CHAT]:input})[CHAT];
    assert.equal(cleaned,expected);
    assert.ok(cleaned.length<=4000);
  }
});

test('direct draft updates and storage writes share the grapheme-safe limit',()=>{
  const input='x'.repeat(3990)+'👩🏽‍💻tail';
  const updated=updateChatDraftEntry({},CHAT,input);
  assert.ok(updated[CHAT].includes('👩🏽‍💻'));
  assert.ok(updated[CHAT].length<=4000);
  writeChatDrafts(A,{[CHAT]:input});
  assert.equal(readChatDrafts(A)[CHAT],updated[CHAT]);
  clearChatDrafts(A);
});

test('fallback without Intl.Segmenter keeps common emoji and combining clusters intact',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
  assert.ok(descriptor,'test runtime must expose Intl.Segmenter to simulate its absence');
  try{
    Object.defineProperty(Intl,'Segmenter',{...descriptor,value:undefined});
    const cases=[
      ['x'.repeat(3990)+'👨‍👩‍👧‍👦tail','x'.repeat(3990)],
      ['x'.repeat(3998)+'🇸🇪tail','x'.repeat(3998)],
      ['x'.repeat(3999)+'e\u0301tail','x'.repeat(3999)],
      ['x'.repeat(3997)+'👍🏽tail','x'.repeat(3997)]
    ];
    for(const [input,expected] of cases){
      assert.equal(cleanChatDrafts({[CHAT]:input})[CHAT],expected);
    }
  }finally{
    Object.defineProperty(Intl,'Segmenter',descriptor);
  }
});
