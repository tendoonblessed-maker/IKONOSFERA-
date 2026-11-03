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


test('pending channel settings preserve newer server-owned metadata',()=>{
 const now=1000;
 const old=channel();
 const edited=channel({title:'Новое название',avatar_path:'new-user/avatar.jpg'});
 const pending=new Map([[old.id,{channel:edited,expiresAt:now+1000}]]);
 // The server list is newer for metadata, but older for the edited settings.
 const remote=channel({
  created_at:'2026-11-03T00:00:00Z'
 });
 const [result]=reconcileRecentChannelUpdates([remote],pending,now+10);
 assert.equal(result.id,remote.id);
 assert.equal(result.owner_id,remote.owner_id);
 assert.equal(result.created_at,remote.created_at);
 assert.equal(result.title,edited.title);
 assert.equal(result.avatar_path,edited.avatar_path);
 assert.equal(pending.size,1,'wait for confirmation of editable settings');
 assert.equal(remote.title,old.title,'do not mutate the server response');
});

test('a matching server snapshot releases pending settings without replacing its metadata',()=>{
 const now=1000;
 const edited=channel({title:'Новое название'});
 const remote={...edited,created_at:'2026-11-03T00:00:00Z'};
 const pending=new Map([[edited.id,{channel:edited,expiresAt:now+1000}]]);
 const result=reconcileRecentChannelUpdates([remote],pending,now+10);
 assert.equal(result[0],remote);
 assert.equal(pending.size,0);
});


test('ownership change discards old owner pending edits instead of leaking them to a new owner',()=>{
 const now=1000;
 const old=channel();
 const pending=new Map([[old.id,{channel:channel({title:'Old owner pending edit',avatar_path:'old-owner/private.jpg'}),expiresAt:now+1000}]]);
 const transferred=channel({owner_id:'44444444-4444-4444-8444-444444444444',title:'New owner title',avatar_path:'new-owner/avatar.jpg'});
 const result=reconcileRecentChannelUpdates([transferred],pending,now+10);
 assert.equal(result[0],transferred,'new owner server snapshot is authoritative');
 assert.equal(result[0].avatar_path,'new-owner/avatar.jpg');
 assert.equal(pending.size,0,'do not replay old edits on future refreshes');
});


test('mismatched pending channel identity cannot overwrite another channel',()=>{
 const now=1000;
 const remote=channel({title:'Authoritative channel',avatar_path:'right/avatar.jpg'});
 const foreign=channel({id:'55555555-5555-4555-8555-555555555555',title:'Other channel',avatar_path:'wrong/avatar.jpg'});
 const pending=new Map([[remote.id,{channel:foreign,expiresAt:now+1000}]]);
 const [result]=reconcileRecentChannelUpdates([remote],pending,now+10);
 assert.equal(result,remote,'preserve the authoritative channel record');
 assert.equal(result.avatar_path,'right/avatar.jpg');
 assert.equal(pending.size,0,'discard the invalid pending entry');
});
