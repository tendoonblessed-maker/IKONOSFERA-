import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createAppBadgeSynchronizer} from '../lib/app-badge.ts';

const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');

test('sets a non-negative integer badge using the inbox unread total',async()=>{
 const calls=[];
 const sync=createAppBadgeSynchronizer({
  setAppBadge:count=>{calls.push(['set',count]);},
  clearAppBadge:()=>{calls.push(['clear']);}
 });
 await sync(4.9);
 assert.deepEqual(calls,[['set',4]]);
});

test('clears the badge for zero, negative and non-finite counts',async()=>{
 const calls=[];
 const sync=createAppBadgeSynchronizer({
  setAppBadge:count=>{calls.push(['set',count]);},
  clearAppBadge:()=>{calls.push(['clear']);}
 });
 await sync(0);
 await sync(-3);
 await sync(Number.NaN);
 await sync(Number.POSITIVE_INFINITY);
 assert.deepEqual(calls,[['clear'],['clear'],['clear'],['clear']]);
});

test('coalesces queued updates so only the newest unread count is applied',async()=>{
 const calls=[];
 const sync=createAppBadgeSynchronizer({
  setAppBadge:count=>{calls.push(['set',count]);},
  clearAppBadge:()=>{calls.push(['clear']);}
 });
 const first=sync(1);
 const second=sync(8);
 const third=sync(0);
 await Promise.all([first,second,third]);
 assert.deepEqual(calls,[['clear']]);
});

test('serializes an in-flight update before applying the newest count',async()=>{
 const calls=[];
 let releaseFirst;
 let markStarted;
 const started=new Promise(resolve=>{markStarted=resolve;});
 const sync=createAppBadgeSynchronizer({
  setAppBadge:count=>{
   calls.push(count);
   if(count===1)return new Promise(resolve=>{releaseFirst=resolve;markStarted();});
  }
 });
 const first=sync(1);
 await started;
 const second=sync(2);
 releaseFirst();
 await Promise.all([first,second]);
 assert.deepEqual(calls,[1,2]);
});

test('unsupported or rejected badge APIs fail silently',async()=>{
 const unsupported=createAppBadgeSynchronizer({});
 const rejected=createAppBadgeSynchronizer({
  setAppBadge:()=>Promise.reject(new Error('not allowed')),
  clearAppBadge:()=>{throw new Error('unsupported');}
 });
 await assert.doesNotReject(unsupported(5));
 await assert.doesNotReject(unsupported(0));
 await assert.doesNotReject(rejected(5));
 await assert.doesNotReject(rejected(0));
});

test('AppShell mirrors direct and group unread totals without requesting notification permission',()=>{
 assert.match(shell,/createAppBadgeSynchronizer\(api\)/);
 assert.match(shell,/appBadgeSyncRef\.current\?\.\(userId\?unreadTotal:0\)/);
 assert.match(shell,/rows\.reduce\(\(sum,row\)=>sum\+Number\(row\.preview\?\.unread_count\|\|0\),0\)\+groups\.reduce/);
 assert.doesNotMatch(shell,/Notification\.requestPermission/);
});

test('logout clears account-scoped group unread snapshots before resetting the account',()=>{
 const start=shell.indexOf('async function logout(){');
 const end=shell.indexOf('async function install()',start);
 assert.ok(start>=0&&end>start,'logout handler should remain discoverable');
 const body=shell.slice(start,end);
 const clearGroups=body.indexOf('setGroups([])');
 const clearOverviews=body.indexOf('setGroupOverviews({})');
 const resetAccount=body.indexOf("setUserId('')");
 assert.ok(clearGroups>=0,'logout must clear the previous account group list');
 assert.ok(clearOverviews>=0,'logout must clear the previous account unread overview');
 assert.ok(resetAccount>=0,'logout must reset the signed-in account');
 assert.ok(clearGroups<resetAccount&&clearOverviews<resetAccount,
  'account-scoped unread state must be cleared before the account identity changes');
});
