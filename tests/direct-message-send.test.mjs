import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {DirectMessageSendLock,shouldClearSubmittedDraft} from '../lib/direct-message-send.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const CHAT='33333333-3333-4333-8333-333333333333';
const OTHER_CHAT='44444444-4444-4444-8444-444444444444';
const key=(owner,chat)=>owner+':'+chat;
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('one direct text send per account/chat is admitted before React rerenders',()=>{
  const lock=new DirectMessageSendLock();
  const context=key(OWNER,CHAT);
  const first=lock.acquire(context);
  assert.equal(typeof first,'number');
  assert.equal(lock.acquire(context),null,'a same-turn duplicate submit is rejected');
  assert.equal(lock.release(context,first),true);
  assert.notEqual(lock.acquire(context),null,'a later deliberate send is allowed');
});

test('direct send leases are isolated by account and conversation',()=>{
  const lock=new DirectMessageSendLock();
  const a=lock.acquire(key(OWNER,CHAT));
  const b=lock.acquire(key(OWNER,OTHER_CHAT));
  const c=lock.acquire(key(OTHER,CHAT));
  assert.notEqual(a,null);
  assert.notEqual(b,null);
  assert.notEqual(c,null);
  assert.equal(lock.acquire(key(OWNER,CHAT)),null);
  assert.equal(lock.isLocked(key(OWNER,CHAT)),true);
  assert.equal(lock.release(key(OWNER,OTHER_CHAT),b),true);
  assert.equal(lock.release(key(OTHER,CHAT),c),true);
  assert.equal(lock.isLocked(key(OWNER,CHAT)),true);
  assert.equal(lock.release(key(OWNER,CHAT),a),true);
  assert.equal(lock.isLocked(key(OWNER,CHAT)),false);
});

test('a stale completion cannot release a newer direct send lease',()=>{
  const lock=new DirectMessageSendLock();
  const context=key(OWNER,CHAT);
  const oldToken=lock.acquire(context);
  assert.equal(lock.release(context,oldToken),true);
  const newToken=lock.acquire(context);
  assert.notEqual(newToken,oldToken);
  assert.equal(lock.release(context,oldToken),false);
  assert.equal(lock.release(context,newToken),true);
});

test('a successful send clears only the same unchanged draft revision',()=>{
  assert.equal(shouldClearSubmittedDraft(4,4,' hello ','hello'),true);
  assert.equal(shouldClearSubmittedDraft(4,5,'hello','hello'),false,
    'retyping the same text creates a new revision');
  assert.equal(shouldClearSubmittedDraft(4,4,'hello','a newer draft'),false);
  assert.equal(shouldClearSubmittedDraft(4,4,'  ','  '),false);
});

test('AppShell locks before POST, revisions draft edits and ignores stale completions',()=>{
  const shell=source('components/AppShell.tsx');
  const start=shell.indexOf('async function sendMessage(');
  const end=shell.indexOf('async function toggleSavedContact(',start);
  assert.ok(start>=0&&end>start);
  const send=shell.slice(start,end);
  const acquire=send.indexOf('lock.acquire(draftKey)');
  const post=send.indexOf('await postMessage(');
  assert.ok(acquire>=0&&post>acquire,'acquire synchronously before the first network await');
  assert.match(send,/shouldClearSubmittedDraft\(/);
  assert.match(send,/submittedDraftRevision=draftRevisionRef\.current\.get\(draftKey\)\?\?0/);
  assert.match(send,/draftGenerationRef\.current===submittedDraftGeneration/);
  assert.match(send,/finally\{[\s\S]*lock\.release\(draftKey,lockToken\)/);
  assert.match(send,/directMessageSendUiTokenRef\.current===uiToken/);
  const updateStart=shell.indexOf('function updateChatDraft(');
  const updateEnd=shell.indexOf('\n  useEffect(',updateStart);
  const update=shell.slice(updateStart,updateEnd);
  assert.match(update,/draftRevisionRef\.current\.set\(revisionKey/);
  const logoutStart=shell.indexOf('async function logout(){');
  const logoutEnd=shell.indexOf('\n  async function install()',logoutStart);
  const logout=shell.slice(logoutStart,logoutEnd);
  assert.match(logout,/draftGenerationRef\.current\+\+/);
  assert.match(logout,/directMessageSendUiTokenRef\.current\+\+/);
});
