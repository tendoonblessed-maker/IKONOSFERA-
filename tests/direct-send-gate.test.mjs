import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createDirectSendGate} from '../lib/direct-send-gate.ts';

test('only one direct send can be in flight for the same account and chat',()=>{
 const gate=createDirectSendGate();
 const lease=gate.tryAcquire('user-a','chat-a');
 assert.equal(typeof lease,'symbol');
 assert.equal(gate.isInFlight('user-a','chat-a'),true);
 assert.equal(gate.tryAcquire('user-a','chat-a'),null);
 assert.equal(gate.release('user-a','chat-a',lease),true);
 assert.equal(gate.isInFlight('user-a','chat-a'),false);
 assert.equal(typeof gate.tryAcquire('user-a','chat-a'),'symbol');
});

test('different accounts and chats have independent send locks',()=>{
 const gate=createDirectSendGate();
 const first=gate.tryAcquire('user-a','chat-a');
 const second=gate.tryAcquire('user-a','chat-b');
 const third=gate.tryAcquire('user-b','chat-a');
 assert.equal(typeof first,'symbol');
 assert.equal(typeof second,'symbol');
 assert.equal(typeof third,'symbol');
 assert.equal(gate.tryAcquire('user-a','chat-a'),null);
});

test('releasing one chat does not unlock another chat or account',()=>{
 const gate=createDirectSendGate();
 const first=gate.tryAcquire('user-a','chat-a');
 const second=gate.tryAcquire('user-b','chat-a');
 assert.equal(gate.release('user-a','chat-a',first),true);
 assert.equal(typeof gate.tryAcquire('user-a','chat-a'),'symbol');
 assert.equal(gate.tryAcquire('user-b','chat-a'),null);
 assert.equal(gate.release('user-b','chat-a',second),true);
});

test('a stale lease cannot release a newer send attempt for the same chat',()=>{
 const gate=createDirectSendGate();
 const oldLease=gate.tryAcquire('user-a','chat-a');
 assert.equal(gate.release('user-a','chat-a',oldLease),true);
 const currentLease=gate.tryAcquire('user-a','chat-a');
 assert.equal(typeof currentLease,'symbol');
 assert.equal(gate.release('user-a','chat-a',oldLease),false);
 assert.equal(gate.isInFlight('user-a','chat-a'),true);
 assert.equal(gate.tryAcquire('user-a','chat-a'),null);
 assert.equal(gate.release('user-a','chat-a',currentLease),true);
 assert.equal(gate.isInFlight('user-a','chat-a'),false);
});

test('empty or malformed context cannot acquire a send lock',()=>{
 const gate=createDirectSendGate();
 assert.equal(gate.tryAcquire('','chat-a'),null);
 assert.equal(gate.tryAcquire('user-a','  '),null);
 assert.equal(gate.tryAcquire(null,'chat-a'),null);
 assert.equal(gate.isInFlight('user-a','chat-a'),false);
});

test('text and attachment handlers use the gate and chat-scoped busy state',()=>{
 const source=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
 const textStart=source.indexOf('async function sendMessage(');
 const attachmentStart=source.indexOf("async function sendAttachment(");
 const logoutStart=source.indexOf('async function logout()',attachmentStart);
 assert.ok(textStart>=0&&attachmentStart>textStart&&logoutStart>attachmentStart);
 const textSend=source.slice(textStart,attachmentStart);
 const attachmentSend=source.slice(attachmentStart,logoutStart);
 assert.match(source,/import \{createDirectSendGate\} from ["']@\/lib\/direct-send-gate["']/);
 assert.match(source,/directSendGateRef=useRef<ReturnType<typeof createDirectSendGate>\|null>\(null\)/);
 assert.match(source,/directSendBusyFor\(ownerId:string,chatId:string\)/);
 assert.match(source,/const directSendBusy=Boolean\(selected&&userId&&directSendBusyFor\(userId,selected\)\)/);
 assert.match(source,/disabled=\{directSendBusy\|\|activePartnerBlocked\|\|!networkOnline\}/);
 assert.match(source,/<VoiceRecorder key=\{userId\+':'+selected\} disabled=\{directSendBusy\|\|activePartnerBlocked\|\|Boolean\(pendingAttachment\)\}/);
 assert.match(source,/if\(draft\.trim\(\)&&!directSendBusy\)e\.currentTarget\.form\?\.requestSubmit\(\)/);
 assert.match(source,/disabled=\{!draft\.trim\(\)\|\|directSendBusy\|\|activePartnerBlocked\|\|!networkOnline\}/);
 assert.match(source,/onDragEnter=\{?event/);
 assert.match(source,/if\(!canPrepareAttachment\|\|directSendBusy\)return/);
 assert.match(source,/sending=\{directSendBusy\} online=\{networkOnline\}/);
 for(const [name,block,networkCall] of [
  ['text',textSend,'await postMessage('],
  ['attachment',attachmentSend,'await sendDirectMedia(']
 ]){
  const acquire=block.indexOf('sendLease=sendGate?.tryAcquire(userId,chatId)');
  const rejected=block.indexOf('if(!sendLease)return;');
  const markBusy=block.indexOf('markDirectSendBusy(userId,chatId,true)');
  const request=block.indexOf(networkCall);
  const release=block.indexOf('sendGate?.release(userId,chatId,sendLease)');
  const clearBusy=block.indexOf('markDirectSendBusy(userId,chatId,false)');
  assert.ok(acquire>=0&&rejected>acquire&&request>rejected,name+' must acquire a lease before its network request');
  assert.ok(markBusy>rejected&&markBusy<request,name+' must mark only its chat busy before the request');
  assert.ok(release>request&&clearBusy>release,name+' must release and clear the exact chat lease in finally');
  assert.doesNotMatch(block,/setSending\(/,name+' must not use the global sending state');
 }
});
