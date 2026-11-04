import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileRecentChannelUpdates,CHANNEL_UPDATE_GRACE_MS} from '../lib/channel-sync.ts';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const channel=(patch={})=>({
 id,owner_id,title:'Server',slug:'server',description:'Original',
 discussion_enabled:false,avatar_path:null,created_at:'2026-11-01T00:00:00Z',...patch
});

test('delayed pre-PATCH list response cannot roll back confirmed settings',()=>{
 const before=channel();
 const confirmed=channel({title:'Updated',description:'New description'});
 const pending=new Map([[id,{channel:confirmed,expiresAt:120_000}]]);
 const result=reconcileRecentChannelUpdates([before],pending,1_000);
 assert.equal(result[0].title,'Updated');
 assert.equal(result[0].description,'New description');
 assert.equal(result[0].created_at,before.created_at);
 assert.equal(before.title,'Server','server snapshot must not be mutated');
 assert.equal(pending.size,1,'keep the confirmed edit until server catches up');
});

test('matching server snapshot acknowledges and removes pending edit',()=>{
 const confirmed=channel({title:'Updated'});
 const pending=new Map([[id,{channel:confirmed,expiresAt:120_000}]]);
 const result=reconcileRecentChannelUpdates([channel({title:'Updated'})],pending,1_000);
 assert.equal(result[0].title,'Updated');
 assert.equal(pending.size,0);
});

test('expired confirmation never overrides a newer server snapshot',()=>{
 const pending=new Map([[id,{channel:channel({title:'Old confirmed'}),expiresAt:1_000}]]);
 const server=channel({title:'Newer server'});
 const result=reconcileRecentChannelUpdates([server],pending,1_000);
 assert.equal(result[0],server);
 assert.equal(pending.size,0);
});

test('untrusted clock and implausibly distant expiry fail closed',()=>{
 const server=channel();
 for(const now of [NaN,Infinity,-Infinity]){
  const pending=new Map([[id,{channel:channel({title:'Cached'}),expiresAt:2_000}]]);
  assert.equal(reconcileRecentChannelUpdates([server],pending,now)[0],server);
  assert.equal(pending.size,0);
 }
 const pending=new Map([[id,{channel:channel({title:'Cached'}),expiresAt:1_000+CHANNEL_UPDATE_GRACE_MS+1}]]);
 assert.equal(reconcileRecentChannelUpdates([server],pending,1_000)[0],server);
 assert.equal(pending.size,0);
});
