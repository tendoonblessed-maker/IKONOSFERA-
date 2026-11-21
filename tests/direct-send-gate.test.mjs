import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createDirectSendGate} from '../lib/direct-send-gate.ts';

test('only one direct send can be in flight for the same account and chat',()=>{
 const gate=createDirectSendGate();
 assert.equal(gate.tryAcquire('user-a','chat-a'),true);
 assert.equal(gate.isInFlight('user-a','chat-a'),true);
 assert.equal(gate.tryAcquire('user-a','chat-a'),false);
 gate.release('user-a','chat-a');
 assert.equal(gate.isInFlight('user-a','chat-a'),false);
 assert.equal(gate.tryAcquire('user-a','chat-a'),true);
});

test('different accounts and chats have independent send locks',()=>{
 const gate=createDirectSendGate();
 assert.equal(gate.tryAcquire('user-a','chat-a'),true);
 assert.equal(gate.tryAcquire('user-a','chat-b'),true);
 assert.equal(gate.tryAcquire('user-b','chat-a'),true);
 assert.equal(gate.tryAcquire('user-a','chat-a'),false);
});

test('releasing one chat does not unlock another chat or account',()=>{
 const gate=createDirectSendGate();
 gate.tryAcquire('user-a','chat-a');
 gate.tryAcquire('user-b','chat-a');
 gate.release('user-a','chat-a');
 assert.equal(gate.tryAcquire('user-a','chat-a'),true);
 assert.equal(gate.tryAcquire('user-b','chat-a'),false);
});

test('empty or malformed context cannot acquire a send lock',()=>{
 const gate=createDirectSendGate();
 assert.equal(gate.tryAcquire('','chat-a'),false);
 assert.equal(gate.tryAcquire('user-a','  '),false);
 assert.equal(gate.tryAcquire(null,'chat-a'),false);
 assert.equal(gate.isInFlight('user-a','chat-a'),false);
});

test('text and attachment send handlers share the synchronous per-chat gate',()=>{
 const source=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
 const textStart=source.indexOf('async function sendMessage(');
 const attachmentStart=source.indexOf("async function sendAttachment(");
 const logoutStart=source.indexOf('async function logout()',attachmentStart);
 assert.ok(textStart>=0&&attachmentStart>textStart&&logoutStart>attachmentStart);
 const textSend=source.slice(textStart,attachmentStart);
 const attachmentSend=source.slice(attachmentStart,logoutStart);
 assert.match(source,/import \{createDirectSendGate\} from ["']@\/lib\/direct-send-gate["']/);
 assert.match(source,/directSendGateRef=useRef<ReturnType<typeof createDirectSendGate>\|null>\(null\)/);
 for(const [name,block,networkCall] of [
  ['text',textSend,'await postMessage('],
  ['attachment',attachmentSend,'await sendDirectMedia(']
 ]){
  const acquire=block.indexOf('sendGate?.tryAcquire(userId,chatId)');
  const request=block.indexOf(networkCall);
  const release=block.indexOf('sendGate.release(userId,chatId)');
  assert.ok(acquire>=0&&request>acquire, name+' must acquire the lock before its network request');
  assert.ok(release>request, name+' must release the lock in finally after the request');
 }
});
