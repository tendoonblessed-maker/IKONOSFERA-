import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanChatDrafts,readChatDrafts,writeChatDrafts,clearChatDrafts} from '../lib/chat-drafts.ts';

const USER_A='11111111-1111-4111-8111-111111111111';
const USER_B='22222222-2222-4222-8222-222222222222';
const CHAT_A='33333333-3333-4333-8333-333333333333';
const CHAT_B='44444444-4444-4444-8444-444444444444';
const data=new Map();
const storage={
  getItem:key=>data.get(key)??null,
  setItem:(key,value)=>data.set(key,value),
  removeItem:key=>data.delete(key)
};
globalThis.window={sessionStorage:storage};

test('direct message drafts remain isolated across accounts and chats',()=>{
  data.clear();
  writeChatDrafts(USER_A,{[CHAT_A]:'Hello',[CHAT_B]:'Second'});
  writeChatDrafts(USER_B,{[CHAT_A]:'Private'});
  assert.deepEqual(readChatDrafts(USER_A),{[CHAT_A]:'Hello',[CHAT_B]:'Second'});
  assert.deepEqual(readChatDrafts(USER_B),{[CHAT_A]:'Private'});
  clearChatDrafts(USER_A);
  assert.deepEqual(readChatDrafts(USER_A),{});
  assert.equal(readChatDrafts(USER_B)[CHAT_A],'Private');
});

test('draft sanitization rejects malformed entries and retains intentional whitespace',()=>{
  assert.deepEqual(cleanChatDrafts(null),{});
  assert.deepEqual(cleanChatDrafts([]),{});
  assert.deepEqual(cleanChatDrafts({invalid:'no',[CHAT_A]:'   ',[CHAT_B]:'  Hi\n  '}),{[CHAT_B]:'  Hi\n  '});
  assert.equal(cleanChatDrafts({[CHAT_A]:'x'.repeat(5000)})[CHAT_A].length,4000);
  assert.deepEqual(readChatDrafts('invalid'),{});
});

test('corrupted or unavailable sessionStorage does not crash the composer',()=>{
  data.clear();
  data.set('ikonosfera-drafts-tab-v1:'+USER_A,'{broken');
  assert.deepEqual(readChatDrafts(USER_A),{});
  const old=globalThis.window;
  try{
    Object.defineProperty(globalThis,'window',{configurable:true,value:{
      get sessionStorage(){throw Error('Storage disabled');}
    }});
    assert.doesNotThrow(()=>writeChatDrafts(USER_A,{[CHAT_A]:'Still typing'}));
    assert.deepEqual(readChatDrafts(USER_A),{});
    assert.doesNotThrow(()=>clearChatDrafts(USER_A));
  }finally{
    Object.defineProperty(globalThis,'window',{configurable:true,value:old});
  }
});

test('empty drafts remove stored data instead of leaving stale previews',()=>{
  data.clear();
  writeChatDrafts(USER_A,{[CHAT_A]:'Saved'});
  assert.equal(data.size,1);
  writeChatDrafts(USER_A,{[CHAT_A]:'   '});
  assert.deepEqual(readChatDrafts(USER_A),{});
  assert.equal(data.size,0);
});
