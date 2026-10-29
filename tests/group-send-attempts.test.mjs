import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 GROUP_SEND_ATTEMPT_TTL_MS,
 readGroupSendAttempt,getOrCreateGroupSendAttempt,
 clearGroupSendAttempt,clearAllGroupSendAttempts
} from '../lib/group-send-attempts.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const GROUP='33333333-3333-4333-8333-333333333333';
const GROUP_B='44444444-4444-4444-8444-444444444444';
const memory=new Map();
const storage={
 getItem:k=>memory.get(k)??null,
 setItem:(k,v)=>memory.set(k,v),
 removeItem:k=>memory.delete(k),
 key:i=>Array.from(memory.keys())[i]??null,
 get length(){return memory.size;}
};
globalThis.window={sessionStorage:storage};
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('retries of one group draft use the same UUID, not a fresh message',()=>{
 const body='Привет';
 const a=getOrCreateGroupSendAttempt(OWNER,GROUP,body);
 const b=getOrCreateGroupSendAttempt(OWNER,GROUP,body);
 assert.deepEqual(a,b);
 assert.match(a.id,/^[\da-f]{8}-[\da-f-]{27}$/i);
 assert.equal(readGroupSendAttempt(OWNER,GROUP)?.id,a.id);
 clearGroupSendAttempt(OWNER,GROUP,a.id);
 assert.equal(readGroupSendAttempt(OWNER,GROUP),null);
 const c=getOrCreateGroupSendAttempt(OWNER,GROUP,body);
 assert.notEqual(c.id,a.id,'a later deliberate send of the same text must be new');
});

test('edits, groups, and accounts have isolated group send attempt IDs',()=>{
 const first=getOrCreateGroupSendAttempt(OWNER,GROUP,'Первый текст');
 const changed=getOrCreateGroupSendAttempt(OWNER,GROUP,'Исправленный текст');
 assert.notEqual(first.id,changed.id);
 const inOtherGroup=getOrCreateGroupSendAttempt(OWNER,GROUP_B,'Исправленный текст');
 const otherOwner=getOrCreateGroupSendAttempt(OTHER,GROUP,'Исправленный текст');
 assert.notEqual(inOtherGroup.id,changed.id);
 assert.notEqual(otherOwner.id,changed.id);
 clearGroupSendAttempt(OWNER,GROUP,first.id);
 assert.equal(readGroupSendAttempt(OWNER,GROUP)?.id,changed.id,'late ack cannot erase newer attempt');
});

test('group attempts survive remount via tab sessionStorage, not localStorage',()=>{
 const original=getOrCreateGroupSendAttempt(OWNER,GROUP,'Надёжность');
 assert.equal(readGroupSendAttempt(OWNER,GROUP)?.id,original.id);
 const code=source('lib/group-send-attempts.ts');
 assert.match(code,/sessionStorage/);
 assert.doesNotMatch(code,/window\.localStorage|fetch\(/);
});

test('invalid, malformed, expired and future-dated send attempts are discarded',()=>{
 const now=Date.now();
 const original=getOrCreateGroupSendAttempt(OWNER,GROUP,'Срок',now);
 const key='ikonosfera-group-send-v1:'+OWNER+':'+GROUP;
 const expired={...original,createdAt:now-GROUP_SEND_ATTEMPT_TTL_MS-1};
 memory.set(key,JSON.stringify(expired));
 assert.equal(readGroupSendAttempt(OWNER,GROUP,now),null);
 const fresh=getOrCreateGroupSendAttempt(OWNER,GROUP,'Срок',now);
 memory.set(key,JSON.stringify({...fresh,createdAt:now+300_001}));
 assert.equal(readGroupSendAttempt(OWNER,GROUP,now),null);
 memory.set(key,'{not JSON');
 assert.equal(readGroupSendAttempt(OWNER,GROUP,now),null);
 assert.throws(()=>getOrCreateGroupSendAttempt(OWNER,GROUP,'  '));
});

test('sign-out clears only this account pending attempts and preserves other accounts',()=>{
 getOrCreateGroupSendAttempt(OWNER,GROUP,'A');
 const other=getOrCreateGroupSendAttempt(OTHER,GROUP,'B');
 clearAllGroupSendAttempts(OWNER);
 assert.equal(readGroupSendAttempt(OWNER,GROUP),null);
 assert.equal(readGroupSendAttempt(OTHER,GROUP)?.id,other.id);
});

test('storage unavailable does not prevent same-runtime retries',()=>{
 const prev=globalThis.window;
 try{
  Object.defineProperty(globalThis,'window',{
   configurable:true,value:{get sessionStorage(){throw Error('storage denied');}}
  });
  const a=getOrCreateGroupSendAttempt(OWNER,GROUP,'Недоступное хранилище');
  const b=getOrCreateGroupSendAttempt(OWNER,GROUP,'Недоступное хранилище');
  assert.equal(a.id,b.id);
  clearGroupSendAttempt(OWNER,GROUP,a.id);
  assert.equal(readGroupSendAttempt(OWNER,GROUP),null);
 }finally{Object.defineProperty(globalThis,'window',{configurable:true,value:prev});}
});

test('group send API uses INSERT DO NOTHING + read back the original ID under RLS',()=>{
 const api=source('lib/groups.ts');
 const method=api.slice(api.indexOf('export async function sendGroupMessage('),api.indexOf('export async function listGroupOverviews('));
 assert.match(method,/id:messageId,group_id:id,sender_id:userId,body:trimmed/);
 assert.match(method,/resolution=ignore-duplicates,return=representation/);
 assert.match(method,/on_conflict=id/);
 assert.match(method,/readGroupSendResult\(token,id,userId,messageId\)/);
 assert.match(method,/AbortSignal\.timeout\(18000\)/);
 assert.match(api,/return \(await request<GroupMessage\[\]>\(token,url\)\)\[0\]/);
 assert.match(api,/row\.id!==messageId\|\|row\.group_id!==groupId\|\|row\.sender_id!==userId\|\|row\.body!==body/);
 assert.doesNotMatch(method,/resolution=merge-duplicates/);
});

test('failed sends remain manual, retry with existing UUID and cannot erase newer drafts',()=>{
 const group=source('components/GroupPanel.tsx');
 const shell=source('components/AppShell.tsx');
 const send=group.slice(group.indexOf('async function send('),group.indexOf(' const names='));
 assert.match(send,/getOrCreateGroupSendAttempt\(accountId,groupId,body\)/);
 assert.match(send,/sendGroupMessage\(requestToken,groupId,accountId,body,attempt\.id\)/);
 assert.match(send,/clearGroupSendAttempt\(accountId,groupId,attempt\.id\)/);
 assert.match(send,/if\(draftVersionRef\.current===sentDraftVersion\)\{/);
 assert.match(send,/setRetryAvailable\(true\)/);
 assert.match(group,/composerFormRef\.current\?\.requestSubmit\(\)/);
 assert.match(group,/Повторить отправку/);
 assert.match(shell,/clearAllGroupSendAttempts\(userId\)/);
 assert.match(group,/if\(!online\|\|!navigator\.onLine\)/);
});
