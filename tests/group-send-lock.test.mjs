import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {GroupSendLock} from '../lib/group-send-lock.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const GROUP='33333333-3333-4333-8333-333333333333';
const GROUP_B='44444444-4444-4444-8444-444444444444';
const key=(owner,group)=>owner+':'+group;
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only one synchronous submit can hold a group/account lock',()=>{
  const lock=new GroupSendLock();
  const context=key(OWNER,GROUP);
  const first=lock.acquire(context);
  assert.equal(typeof first,'number');
  assert.equal(lock.acquire(context),null,'second submit is rejected before React rerenders');
  assert.equal(lock.isLocked(context),true);
  assert.equal(lock.release(context,first),true);
  assert.equal(lock.isLocked(context),false);
  assert.notEqual(lock.acquire(context),null,'a manual retry is allowed after completion');
});

test('different accounts and groups have independent send locks',()=>{
  const lock=new GroupSendLock();
  const a=lock.acquire(key(OWNER,GROUP));
  const b=lock.acquire(key(OWNER,GROUP_B));
  const c=lock.acquire(key(OTHER,GROUP));
  assert.notEqual(a,null);
  assert.notEqual(b,null);
  assert.notEqual(c,null);
  assert.equal(lock.acquire(key(OWNER,GROUP)),null);
  assert.equal(lock.release(key(OWNER,GROUP_B),b),true);
  assert.equal(lock.isLocked(key(OWNER,GROUP)),true);
  assert.equal(lock.isLocked(key(OTHER,GROUP)),true);
});

test('a late completion cannot release a newer attempt for the same context',()=>{
  const lock=new GroupSendLock();
  const context=key(OWNER,GROUP);
  const oldToken=lock.acquire(context);
  assert.equal(lock.release(context,oldToken),true);
  const newToken=lock.acquire(context);
  assert.notEqual(newToken,oldToken);
  assert.equal(lock.release(context,oldToken),false);
  assert.equal(lock.isLocked(context),true);
  assert.equal(lock.release(context,newToken),true);
});

test('GroupPanel acquires before network work and releases only its own token in finally',()=>{
  const panel=source('components/GroupPanel.tsx');
  const send=panel.slice(panel.indexOf('async function send('),panel.indexOf(' const names='));
  const acquire=send.indexOf('sendLockRef.current.acquire(lockKey)');
  const network=send.indexOf('await sendGroupMessage(');
  assert.ok(acquire>=0&&network>acquire,'synchronous lock must be acquired before the first network await');
  assert.match(send,/if\(lockToken===null\)return/);
  assert.match(send,/finally\{[\s\S]*sendLockRef\.current\.release\(lockKey,lockToken\)/);
  assert.match(panel,/const busy=busyKeys\.has\(sendLockKey\)/);
  assert.match(panel,/setBusyKeys\(current=>new Set\(current\)\.add\(lockKey\)\)/);
  assert.match(send,/next\.delete\(lockKey\)/);
  assert.doesNotMatch(send,/setBusy\(false\)/,'an older request must not clear a newer context busy state');
});
