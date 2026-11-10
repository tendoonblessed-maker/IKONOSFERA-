import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {removeRealtimeChannelWithDeadline} from '../lib/realtime-cleanup.ts';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('disconnects once after a successful channel removal and clears its watchdog',async()=>{
 let removed=0,disconnected=0;
 removeRealtimeChannelWithDeadline(()=>{removed++;return Promise.resolve('ok');},()=>{disconnected++;},12);
 assert.equal(removed,1);
 await pause(0);
 assert.equal(disconnected,1);
 await pause(25);
 assert.equal(disconnected,1);
});

test('disconnects after a rejected channel removal',async()=>{
 let disconnected=0;
 removeRealtimeChannelWithDeadline(()=>Promise.reject(new Error('offline')),()=>{disconnected++;},30);
 await pause(0);
 assert.equal(disconnected,1);
});

test('disconnects when channel removal throws synchronously',()=>{
 let disconnected=0;
 assert.doesNotThrow(()=>removeRealtimeChannelWithDeadline(()=>{throw new Error('closed');},()=>{disconnected++;},30));
 assert.equal(disconnected,1);
});

test('forces socket teardown when removeChannel hangs and ignores late settlement',async()=>{
 let resolveRemoval;
 let disconnected=0;
 const pending=new Promise(resolve=>{resolveRemoval=resolve;});
 removeRealtimeChannelWithDeadline(()=>pending,()=>{disconnected++;},8);
 await pause(20);
 assert.equal(disconnected,1);
 resolveRemoval('ok');
 await pause(0);
 assert.equal(disconnected,1);
});

test('disconnect exceptions are swallowed and never retried after a late leave response',async()=>{
 let resolveRemoval;
 let disconnected=0;
 const pending=new Promise(resolve=>{resolveRemoval=resolve;});
 removeRealtimeChannelWithDeadline(
  ()=>pending,
  ()=>{disconnected++;throw new Error('socket already closed');},
  8
 );
 await pause(20);
 assert.equal(disconnected,1);
 resolveRemoval('ok');
 await pause(0);
 assert.equal(disconnected,1);
});

test('direct, group and inbox Realtime clients all use bounded teardown',()=>{
 for(const path of ['lib/direct-realtime.ts','lib/group-realtime.ts','lib/inbox-realtime.ts']){
  const source=load(path);
  assert.match(source,/removeRealtimeChannelWithDeadline\(/);
  assert.match(source,/\(\)=>client\.removeChannel\(channel\)/);
  assert.match(source,/\(\)=>client\.realtime\.disconnect\(\)/);
  assert.doesNotMatch(source,/\.finally\(\(\)=>\{client\.realtime\.disconnect\(\);\}\)/);
 }
});
