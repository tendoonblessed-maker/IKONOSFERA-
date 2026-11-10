import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createSingleFlightGate,sendThenRefresh} from '../lib/channel-discussion-send.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('single-flight gate blocks a second tap synchronously until the first send settles',async()=>{
 const gate=createSingleFlightGate();
 let release;
 let calls=0;
 const first=gate.run(()=>new Promise(resolve=>{calls++;release=resolve;}));
 assert.ok(first instanceof Promise);
 assert.equal(gate.run(async()=>{calls++;return 'duplicate';}),null);
 await Promise.resolve();
 assert.equal(calls,1);
 release('accepted');
 assert.equal(await first,'accepted');
 const next=gate.run(async()=>{calls++;return 'next';});
 assert.equal(await next,'next');
 assert.equal(calls,2);
});

test('single-flight gate releases after a rejected send so a deliberate retry can proceed',async()=>{
 const gate=createSingleFlightGate();
 const failed=gate.run(async()=>{throw new Error('network unavailable');});
 await assert.rejects(failed,/network unavailable/);
 const retry=gate.run(async()=> 'accepted after retry');
 assert.equal(await retry,'accepted after retry');
});

test('separate channel panels can submit independently',async()=>{
 const first=createSingleFlightGate();
 const second=createSingleFlightGate();
 let release;
 const pending=first.run(()=>new Promise(resolve=>{release=resolve;}));
 await Promise.resolve();
 const independent=second.run(async()=> 'other channel');
 assert.equal(await independent,'other channel');
 release('first channel');
 assert.equal(await pending,'first channel');
});

test('confirmed send clears its draft before a failed refresh and reports stale UI separately',async()=>{
 let cleared=false;
 let refreshCalls=0;
 const result=await sendThenRefresh(
  async()=> 'server-accepted-id',
  ()=>{cleared=true;},
  async()=>{refreshCalls++;throw new Error('refresh unavailable');}
 );
 assert.equal(result.value,'server-accepted-id');
 assert.equal(result.refreshed,false);
 assert.match(String(result.refreshError),/refresh unavailable/);
 assert.equal(cleared,true);
 assert.equal(refreshCalls,1);
});

test('send failure does not clear the draft or start a refresh',async()=>{
 let cleared=false,refreshed=false;
 await assert.rejects(sendThenRefresh(
  async()=>{throw new Error('send failed');},
  ()=>{cleared=true;},
  async()=>{refreshed=true;}
 ),/send failed/);
 assert.equal(cleared,false);
 assert.equal(refreshed,false);
});

test('channel discussion and comment forms use the single-flight confirmed-send path',()=>{
 const panel=source('components/ChannelsPanel.tsx');
 assert.match(panel,/createSingleFlightGate/);
 assert.match(panel,/runContentSend/);
 assert.equal((panel.match(/sendThenRefresh\(/g)||[]).length,2);
 assert.match(panel,/Сообщение отправлено, но обсуждение не обновилось/);
 assert.match(panel,/Комментарий отправлен, но список не обновился/);
 assert.match(panel,/setDiscussionDraft\(current=>current===draft\?"":current\)/);
 assert.match(panel,/setCommentDraft\(current=>current===draft\?"":current\)/);
});
