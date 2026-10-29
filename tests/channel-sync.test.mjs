import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileRecentChannelUpdates,CHANNEL_UPDATE_GRACE_MS} from '../lib/channel-sync.ts';

const channel=(overrides={})=>({
 id:'11111111-1111-4111-8111-111111111111',
 owner_id:'22222222-2222-4222-8222-222222222222',
 title:'Наш канал',
 slug:'nash_kanal',
 description:'Новости',
 discussion_enabled:false,
 avatar_path:'old-user/old-picture.jpg',
 created_at:'2026-10-29T00:00:00Z',
 ...overrides
});

test('an older in-flight channel list cannot replace a confirmed new avatar',()=>{
 const now=1000;
 const old=channel();
 const updated=channel({avatar_path:'new-user/new-picture.jpg'});
 const pending=new Map([[old.id,{channel:updated,expiresAt:now+CHANNEL_UPDATE_GRACE_MS}]]);
 const result=reconcileRecentChannelUpdates([old],pending,now+50);
 assert.equal(result[0].avatar_path,updated.avatar_path);
 assert.equal(pending.size,1);
 assert.equal(old.avatar_path,'old-user/old-picture.jpg','never mutate the response');
});

test('server confirmation releases the temporary override',()=>{
 const now=1000;
 const updated=channel({avatar_path:'new-user/new-picture.jpg'});
 const pending=new Map([[updated.id,{channel:updated,expiresAt:now+CHANNEL_UPDATE_GRACE_MS}]]);
 const result=reconcileRecentChannelUpdates([updated],pending,now+300);
 assert.equal(result[0],updated);
 assert.equal(pending.size,0);
});

test('an expired edit protection yields to newer authoritative server data',()=>{
 const now=1000;
 const stale=channel({avatar_path:'old-user/old-picture.jpg'});
 const updated=channel({avatar_path:'new-user/new-picture.jpg'});
 const pending=new Map([[stale.id,{channel:updated,expiresAt:now+100}]]);
 const result=reconcileRecentChannelUpdates([stale],pending,now+101);
 assert.equal(result[0].avatar_path,stale.avatar_path);
 assert.equal(pending.size,0);
});

test('a channel settings edit cannot be reverted by stale title or description',()=>{
 const now=1000;
 const old=channel();
 const updated=channel({title:'Новое название',slug:'newname',description:'Новое описание',discussion_enabled:true});
 const unrelated=channel({id:'33333333-3333-4333-8333-333333333333'});
 const pending=new Map([[old.id,{channel:updated,expiresAt:now+1000}]]);
 const result=reconcileRecentChannelUpdates([old,unrelated],pending,now+1);
 assert.equal(result[0].title,'Новое название');
 assert.equal(result[0].slug,'newname');
 assert.equal(result[0].description,'Новое описание');
 assert.equal(result[0].discussion_enabled,true);
 assert.equal(result[1],unrelated);
});

test('unrelated user channels are not synthesized into an unrelated server list',()=>{
 const now=1000;
 const old=channel();
 const pending=new Map([[old.id,{channel:channel({avatar_path:'new.jpg'}),expiresAt:now+1000}]]);
 assert.deepEqual(reconcileRecentChannelUpdates([],pending,now+2),[]);
});
