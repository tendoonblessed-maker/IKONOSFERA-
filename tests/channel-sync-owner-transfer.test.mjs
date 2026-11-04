import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileRecentChannelUpdates} from '../lib/channel-sync.ts';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const originalOwner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const newOwner='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const channel=(changes={})=>({
  id,owner_id:originalOwner,title:'Server title',slug:'server-title',
  description:'Server description',discussion_enabled:false,avatar_path:null,
  created_at:'2026-11-01T00:00:00Z',...changes
});

test('owner transfer discards old owner pending settings',()=>{
  const confirmed=channel({title:'Old owner edit'});
  const server=channel({owner_id:newOwner,title:'New owner title'});
  const pending=new Map([[id,{channel:confirmed,expiresAt:2000}]]);
  const result=reconcileRecentChannelUpdates([server],pending,1000);
  assert.equal(result[0],server);
  assert.equal(result[0].title,'New owner title');
  assert.equal(pending.size,0);
});

test('confirmed settings never overwrite newer server-owned metadata',()=>{
  const confirmed=channel({title:'Confirmed title',created_at:'2020-01-01T00:00:00Z'});
  const server=channel({created_at:'2026-11-03T00:00:00Z'});
  const pending=new Map([[id,{channel:confirmed,expiresAt:2000}]]);
  const result=reconcileRecentChannelUpdates([server],pending,1000);
  assert.equal(result[0].title,'Confirmed title');
  assert.equal(result[0].created_at,server.created_at);
  assert.equal(result[0].owner_id,server.owner_id);
  assert.equal(server.title,'Server title');
  assert.equal(pending.size,1);
});

test('an owner transfer does not suppress unrelated confirmed channel settings',()=>{
  const otherId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const transferred=channel({owner_id:newOwner});
  const unrelated=channel({id:otherId});
  const pending=new Map([
    [id,{channel:channel({title:'Old owner edit'}),expiresAt:2000}],
    [otherId,{channel:channel({id:otherId,title:'Independent edit'}),expiresAt:2000}]
  ]);
  const result=reconcileRecentChannelUpdates([transferred,unrelated],pending,1000);
  assert.equal(result[0],transferred);
  assert.equal(result[1].title,'Independent edit');
  assert.equal(pending.has(id),false);
  assert.equal(pending.has(otherId),true);
});

test('owner UUID casing alone does not discard confirmed settings',()=>{
  const confirmed=channel({title:'Confirmed edit'});
  const server=channel({owner_id:originalOwner.toUpperCase()});
  const pending=new Map([[id,{channel:confirmed,expiresAt:2000}]]);
  const result=reconcileRecentChannelUpdates([server],pending,1000);
  assert.equal(result[0].title,'Confirmed edit');
  assert.equal(result[0].owner_id,server.owner_id);
  assert.equal(pending.size,1);
});

test('a genuinely different owner UUID still invalidates pending settings after normalization',()=>{
  const confirmed=channel({title:'Old edit',owner_id:originalOwner.toUpperCase()});
  const server=channel({owner_id:newOwner,title:'New owner title'});
  const pending=new Map([[id,{channel:confirmed,expiresAt:2000}]]);
  const result=reconcileRecentChannelUpdates([server],pending,1000);
  assert.equal(result[0],server);
  assert.equal(pending.size,0);
});
