import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 createRealtimeRefreshGate,shouldRefreshChatAfterRealtimeFailure
} from '../lib/chat-realtime-status.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function fakeScheduler(){
 let nextId=0;
 const timers=new Map();
 return {
  schedule(callback,delayMs){
   const id=++nextId;
   timers.set(id,{callback,delayMs});
   return id;
  },
  cancel(id){timers.delete(id);},
  flush(){
   const entry=timers.entries().next().value;
   if(!entry)return false;
   const [id,timer]=entry;
   timers.delete(id);
   timer.callback();
   return true;
  },
  get size(){return timers.size;}
 };
}

test('Realtime channel failures trigger an immediate HTTP reconciliation',()=>{
 for(const status of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])assert.equal(shouldRefreshChatAfterRealtimeFailure(status),true,status);
 for(const status of ['SUBSCRIBED','SUBSCRIBING','JOINING','unknown'])assert.equal(shouldRefreshChatAfterRealtimeFailure(status),false,status);
});

test('direct and group subscriptions wake the RLS-protected refresh on failure',()=>{
 const direct=load('lib/direct-realtime.ts');
 const group=load('lib/group-realtime.ts');
 assert.match(direct,/if\(shouldRefreshChatAfterRealtimeFailure\(status\)\)changed\(\)/);
 assert.match(group,/if\(shouldRefreshChatAfterRealtimeFailure\(status\)\)changed\(\)/);
 assert.match(direct,/if\(!stopped\)refreshGate\.trigger\(\)/);
 assert.match(group,/if\(!disposed\)refreshGate\.trigger\(\)/);
 assert.match(direct,/if\(status==='SUBSCRIBED'\)changed\(\)/);
 assert.match(group,/if\(status==='SUBSCRIBED'\)changed\(\)/);
 assert.match(direct,/refreshGate\.dispose\(\)/);
 assert.match(group,/refreshGate\.dispose\(\)/);
});

test('Realtime failure hints never become message payloads or replace polling',()=>{
 const direct=load('lib/direct-realtime.ts');
 const group=load('lib/group-realtime.ts');
 assert.match(direct,/table:'messages',filter:'chat_id=eq\.'\+chatId/);
 assert.match(group,/table:'group_messages',filter:'group_id=eq\.'\+groupId/);
 assert.match(direct,/6-second HTTP polling fallback remains active/);
 assert.match(group,/periodic HTTPS refresh remains active/);
 assert.doesNotMatch(direct,/JSON\.parse\(payload|setChatMessages/);
 assert.doesNotMatch(group,/JSON\.parse\(payload|setGroupMessages/);
});

test('Realtime refresh gate runs immediately and coalesces a burst into one trailing read',()=>{
 const clock=fakeScheduler();
 const calls=[];
 const gate=createRealtimeRefreshGate(()=>calls.push(calls.length+1),250,clock.schedule,clock.cancel);
 gate.trigger();
 gate.trigger();
 gate.trigger();
 assert.deepEqual(calls,[1]);
 assert.equal(clock.size,1);
 assert.equal(clock.flush(),true);
 assert.deepEqual(calls,[1,2]);
 assert.equal(clock.size,1);
 assert.equal(clock.flush(),true);
 assert.deepEqual(calls,[1,2]);
 assert.equal(clock.size,0);
 gate.dispose();
});

test('Realtime refresh gate continues to deliver one trailing read for each later burst',()=>{
 const clock=fakeScheduler();
 let calls=0;
 const gate=createRealtimeRefreshGate(()=>calls++,100,clock.schedule,clock.cancel);
 gate.trigger();
 clock.flush(); // finish first cooldown
 gate.trigger();
 gate.trigger();
 assert.equal(calls,2);
 clock.flush();
 assert.equal(calls,3);
 gate.dispose();
});

test('disposing a Realtime refresh gate cancels pending work and ignores later events',()=>{
 const clock=fakeScheduler();
 let calls=0;
 const gate=createRealtimeRefreshGate(()=>calls++,100,clock.schedule,clock.cancel);
 gate.trigger();
 gate.trigger();
 assert.equal(calls,1);
 gate.dispose();
 assert.equal(clock.size,0);
 assert.equal(clock.flush(),false);
 gate.trigger();
 assert.equal(calls,1);
});
