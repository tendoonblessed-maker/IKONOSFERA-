import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  applyOwnPostReaction,
  createChannelPostReactionGate,
  updateChannelPostReaction
} from '../lib/channel-post-reaction.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('reaction gate blocks a second tap synchronously for the same scoped post',async()=>{
 const gate=createChannelPostReactionGate();
 let release;
 let calls=0;
 const first=gate.run('channel-a:user-a:post-a',()=>new Promise(resolve=>{calls++;release=resolve;}));
 assert.ok(first instanceof Promise);
 assert.equal(gate.run('channel-a:user-a:post-a',async()=>{calls++;return 'duplicate';}),null);
 await Promise.resolve();
 assert.equal(calls,1);
 release('saved');
 assert.equal(await first,'saved');
});

test('different posts and account scopes do not block each other',async()=>{
 const gate=createChannelPostReactionGate();
 let release;
 const first=gate.run('channel-a:user-a:post-a',()=>new Promise(resolve=>{release=resolve;}));
 await Promise.resolve();
 const otherPost=gate.run('channel-a:user-a:post-b',async()=> 'post-b');
 const otherAccount=gate.run('channel-a:user-b:post-a',async()=> 'user-b');
 assert.equal(await otherPost,'post-b');
 assert.equal(await otherAccount,'user-b');
 release('post-a');
 assert.equal(await first,'post-a');
});

test('reaction gate releases after a failed write so a deliberate retry can proceed',async()=>{
 const gate=createChannelPostReactionGate();
 const failed=gate.run('scope:post',async()=>{throw new Error('write unavailable');});
 await assert.rejects(failed,/write unavailable/);
 const retry=gate.run('scope:post',async()=> 'saved');
 assert.equal(await retry,'saved');
});

test('confirmed reaction replaces only the current user row and preserves other users',()=>{
 const before=[
  {post_id:'post-a',user_id:'user-a',emoji:'👍🏻'},
  {post_id:'post-a',user_id:'user-b',emoji:'❤️'},
  {post_id:'post-b',user_id:'user-a',emoji:'👌🏻'}
 ];
 assert.deepEqual(applyOwnPostReaction(before,'post-a','user-a','✌🏻'),[
  before[1],before[2],{post_id:'post-a',user_id:'user-a',emoji:'✌🏻'}
 ]);
});

test('removing a reaction removes only the current user row for that post',()=>{
 const before=[
  {post_id:'post-a',user_id:'user-a',emoji:'👍🏻'},
  {post_id:'post-a',user_id:'user-b',emoji:'❤️'},
  {post_id:'post-b',user_id:'user-a',emoji:'👌🏻'}
 ];
 assert.deepEqual(applyOwnPostReaction(before,'post-a','user-a',null),[before[1],before[2]]);
});

test('confirmed write applies local state before refresh and reports refresh failure separately',async()=>{
 const order=[];
 const result=await updateChannelPostReaction(
  async()=>{order.push('write');},
  ()=>{order.push('optimistic');},
  async()=>{order.push('refresh');throw new Error('refresh unavailable');}
 );
 assert.deepEqual(order,['write','optimistic','refresh']);
 assert.equal(result.status,'refresh-failed');
 if(result.status==='refresh-failed')assert.match(String(result.error),/refresh unavailable/);
});

test('failed write does not apply local state or start refresh',async()=>{
 let applied=false,refreshed=false;
 await assert.rejects(updateChannelPostReaction(
  async()=>{throw new Error('write rejected');},
  ()=>{applied=true;},
  async()=>{refreshed=true;}
 ),/write rejected/);
 assert.equal(applied,false);
 assert.equal(refreshed,false);
});

test('channel panel uses scoped reaction gate, confirmed refresh handling and per-post pending state',()=>{
 const panel=source('components/ChannelsPanel.tsx');
 assert.match(panel,/createChannelPostReactionGate/);
 assert.match(panel,/reactionScopeRef\.current!==scope/);
 assert.match(panel,/updateChannelPostReaction\(/);
 assert.match(panel,/applyOwnPostReaction\(/);
 assert.match(panel,/Реакция сохранена, но список реакций не обновился/);
 assert.match(panel,/pendingReactionKeys\.has\(reactionScope\+":"\+post\.id\)/);
});
