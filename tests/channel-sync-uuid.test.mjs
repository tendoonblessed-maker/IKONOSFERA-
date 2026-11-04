import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reconcileRecentChannelUpdates} from '../lib/channel-sync.ts';

const makeChannel=(patch={})=>({
 id:'11111111-1111-4111-8111-111111111111',
 owner_id:'22222222-2222-4222-8222-222222222222',
 title:'Server title',slug:'server',description:'Server description',
 discussion_enabled:false,avatar_path:null,created_at:'2026-11-01T00:00:00Z',...patch
});

test('malformed nonempty channel IDs cannot receive cached settings',()=>{
 for(const id of ['not-a-uuid','12345678-1234-1234-1234-zzzzzzzzzzzz','11111111111111111111111111111111']){
  const remote=makeChannel({id});
  const pending=new Map([[id,{channel:makeChannel({id,title:'Cached title'}),expiresAt:2000}]]);
  assert.equal(reconcileRecentChannelUpdates([remote],pending,1000)[0],remote);
  assert.equal(pending.size,0);
 }
});

test('malformed nonempty owner IDs reject cached overrides',()=>{
 for(const owner_id of ['not-a-uuid','22222222-2222-2222-2222-xxxxxxxxxxxx']){
  const remote=makeChannel({owner_id});
  const pending=new Map([[remote.id,{channel:makeChannel({title:'Cached title'}),expiresAt:2000}]]);
  assert.equal(reconcileRecentChannelUpdates([remote],pending,1000)[0],remote);
  assert.equal(pending.size,0);
 }
});

test('valid UUID channel identities retain normal pending settings behavior',()=>{
 const remote=makeChannel();
 const pending=new Map([[remote.id,{channel:makeChannel({title:'Confirmed title'}),expiresAt:2000}]]);
 assert.equal(reconcileRecentChannelUpdates([remote],pending,1000)[0].title,'Confirmed title');
 assert.equal(pending.size,1);
});

test('mixed-case duplicate UUIDs cannot receive cached settings',()=>{
 const id='abcdef12-3456-4abc-8def-123456789abc';
 const upper=id.toUpperCase();
 const remote=[makeChannel({id}),makeChannel({id:upper})];
 const pending=new Map([
  [id,{channel:makeChannel({id,title:'Cached lower'}),expiresAt:2000}],
  [upper,{channel:makeChannel({id:upper,title:'Cached upper'}),expiresAt:2000}]
 ]);
 const result=reconcileRecentChannelUpdates(remote,pending,1000);
 assert.equal(result[0],remote[0]);
 assert.equal(result[1],remote[1]);
 assert.equal(pending.size,0);
});
