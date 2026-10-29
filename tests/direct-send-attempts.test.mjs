import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 DIRECT_SEND_ATTEMPT_TTL_MS,readDirectSendAttempt,getOrCreateDirectSendAttempt,
 clearDirectSendAttempt,clearAllDirectSendAttempts
} from '../lib/direct-send-attempts.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const CHAT='33333333-3333-4333-8333-333333333333';
const CHAT_B='44444444-4444-4444-8444-444444444444';
const REPLY='55555555-5555-4555-8555-555555555555';
const mem=new Map();
globalThis.window={sessionStorage:{
 getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v),
 removeItem:k=>mem.delete(k),key:i=>Array.from(mem.keys())[i]??null,
 get length(){return mem.size;}
}};

test('retries of one direct draft reuse one UUID; a confirmed new send gets a new one',()=>{
 const first=getOrCreateDirectSendAttempt(OWNER,CHAT,'Привет',null);
 const retry=getOrCreateDirectSendAttempt(OWNER,CHAT,'Привет',null);
 assert.deepEqual(retry,first);
 assert.equal(readDirectSendAttempt(OWNER,CHAT)?.id,first.id);
 clearDirectSendAttempt(OWNER,CHAT,first.id);
 assert.equal(readDirectSendAttempt(OWNER,CHAT),null);
 assert.notEqual(getOrCreateDirectSendAttempt(OWNER,CHAT,'Привет',null).id,first.id);
});

test('different reply target, text, account and chat cannot share UUID',()=>{
 const plain=getOrCreateDirectSendAttempt(OWNER,CHAT,'А',null);
 const replying=getOrCreateDirectSendAttempt(OWNER,CHAT,'А',REPLY);
 const newText=getOrCreateDirectSendAttempt(OWNER,CHAT,'Б',REPLY);
 const otherAccount=getOrCreateDirectSendAttempt(OTHER,CHAT,'Б',REPLY);
 const otherChat=getOrCreateDirectSendAttempt(OWNER,CHAT_B,'Б',REPLY);
 assert.notEqual(plain.id,replying.id);
 assert.notEqual(replying.id,newText.id);
 assert.notEqual(newText.id,otherAccount.id);
 assert.notEqual(newText.id,otherChat.id);
 clearDirectSendAttempt(OWNER,CHAT,plain.id);
 assert.equal(readDirectSendAttempt(OWNER,CHAT)?.id,newText.id,'old acknowledgment cannot clear next attempt');
});

test('pending replies survive tab remount with their original reply target',()=>{
 const first=getOrCreateDirectSendAttempt(OWNER,CHAT,'Ответ',REPLY);
 const saved=JSON.parse(mem.get('ikonosfera-direct-send-v1:'+OWNER+':'+CHAT));
 assert.equal(saved.id,first.id);
 assert.equal(saved.replyId,REPLY);
 assert.equal(readDirectSendAttempt(OWNER,CHAT)?.id,first.id);
 const src=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
 assert.match(src,/readDirectSendAttempt\(userId,selected\)/);
 assert.match(src,/if\(attempt\.replyId\)setReplyingTo/);
 assert.match(src,/setDirectSendRetry\(\{owner:userId,chat:selected/);
});

test('malformed and expired attempts are removed; storage failure retains in-memory retry',()=>{
 const now=Date.now();
 getOrCreateDirectSendAttempt(OWNER,CHAT,'Время',null,now);
 const key='ikonosfera-direct-send-v1:'+OWNER+':'+CHAT;
 const expired={...readDirectSendAttempt(OWNER,CHAT,now),createdAt:now-DIRECT_SEND_ATTEMPT_TTL_MS-1};
 mem.set(key,JSON.stringify(expired));
 assert.equal(readDirectSendAttempt(OWNER,CHAT,now),null);
 mem.set(key,'{bad');
 assert.equal(readDirectSendAttempt(OWNER,CHAT,now),null);
 assert.throws(()=>getOrCreateDirectSendAttempt(OWNER,CHAT,'  ',null));
 assert.throws(()=>getOrCreateDirectSendAttempt(OWNER,CHAT,'Привет','not-a-uuid'));
 const original=globalThis.window;
 try{
  globalThis.window={get sessionStorage(){throw Error('blocked');}};
  const first=getOrCreateDirectSendAttempt(OWNER,CHAT,'Fallback',null);
  assert.equal(getOrCreateDirectSendAttempt(OWNER,CHAT,'Fallback',null).id,first.id);
  clearDirectSendAttempt(OWNER,CHAT,first.id);
 }finally{globalThis.window=original;}
});

test('signout removes current account attempts only and never stores auth tokens',()=>{
 getOrCreateDirectSendAttempt(OWNER,CHAT,'Мой текст',null);
 const other=getOrCreateDirectSendAttempt(OTHER,CHAT,'Чужой текст',null);
 clearAllDirectSendAttempts(OWNER);
 assert.equal(readDirectSendAttempt(OWNER,CHAT),null);
 assert.equal(readDirectSendAttempt(OTHER,CHAT)?.id,other.id);
 const helper=readFileSync(new URL('../lib/direct-send-attempts.ts',import.meta.url),'utf8');
 assert.match(helper,/sessionStorage/);
 assert.doesNotMatch(helper,/localStorage|access_token|fetch\(/);
});

test('component only retries manually and protects account drafts and pending confirmations',()=>{
 const app=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
 const send=app.slice(app.indexOf('async function sendMessage('),app.indexOf('async function toggleSavedContact('));
 assert.match(send,/getOrCreateDirectSendAttempt\(userId,chatId,plainText,reply\?\.id\?\?null\)/);
 assert.match(send,/postMessage\(token,chatId,userId,plainText,attempt\.id,reply\?\.id\?\?null\)/);
 assert.match(send,/clearDirectSendAttempt\(userId,chatId,attempt\.id\)/);
 assert.match(send,/draftsOwnerRef\.current===userId&&\(draftsRef\.current\[chatId\]/);
 assert.match(send,/selectedRef\.current===chatId&&draftsOwnerRef\.current===userId/);
 assert.match(app,/onClick=\{\(\)=>composerRef\.current\?\.form\?\.requestSubmit\(\)\}/);
 assert.match(app,/clearAllDirectSendAttempts\(userId\)/);
 assert.match(app,/directSendRetry\.body===draft\.trim\(\)/);
 assert.match(app,/disabled=\{sending\|\|!networkOnline\|\|activePartnerBlocked\}/);
});
