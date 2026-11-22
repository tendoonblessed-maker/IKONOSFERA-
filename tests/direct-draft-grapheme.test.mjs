import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanChatDrafts,updateChatDraftEntry,truncateChatDraft} from '../lib/chat-drafts.ts';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';

test('direct drafts truncate without splitting grapheme clusters at the UTF-16 cap',()=>{
 const plain='x'.repeat(3999);
 const emojiBoundary=plain+'😀';
 assert.equal(truncateChatDraft(emojiBoundary),plain);
 assert.equal(cleanChatDrafts({[A]:emojiBoundary})[A],plain);
 assert.equal(updateChatDraftEntry({},A,emojiBoundary)[A],plain);

 const family='👨‍👩‍👧‍👦';
 const fits='x'.repeat(4000-family.length)+family;
 assert.equal(truncateChatDraft(fits),fits);
 assert.equal(truncateChatDraft('x'.repeat(3999)+'e\\u0301'),'x'.repeat(3999));
 assert.equal(truncateChatDraft('abc',0),'');
 assert.equal(truncateChatDraft('abc',2),'ab');
});

test('direct draft truncation falls back to code-point-safe boundaries without Segmenter',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Intl,'Segmenter');
 try{
  Object.defineProperty(Intl,'Segmenter',{configurable:true,writable:true,value:undefined});
  assert.equal(truncateChatDraft('x'.repeat(3999)+'😀'),'x'.repeat(3999));
  assert.equal(truncateChatDraft('😀'.repeat(2001)).length,4000);
 }finally{
  if(descriptor)Object.defineProperty(Intl,'Segmenter',descriptor);
  else delete Intl.Segmenter;
 }
});

test('draft normalization and updates retain the grapheme-safe cap',()=>{
 const input={[A]:'x'.repeat(3999)+'😀',[B]:'keep'};
 const clean=cleanChatDrafts(input);
 assert.equal(clean[A],'x'.repeat(3999));
 assert.equal(clean[B],'keep');
 const updated=updateChatDraftEntry(clean,A,'z'.repeat(3999)+'👩‍🚀');
 assert.equal(updated[A],'z'.repeat(3999));
 assert.equal(updated[B],'keep');
});
