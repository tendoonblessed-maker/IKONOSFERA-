import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {removeRealtimeChannelWithDeadline} from '../lib/realtime-cleanup.ts';

const UUID='11111111-1111-4111-8111-111111111111';
const modules=[
 ['lib/direct-realtime.ts','subscribeDirectChatChanges'],
 ['lib/group-realtime.ts','subscribeGroupChanges'],
 ['lib/inbox-realtime.ts','subscribeInboxChanges']
];

function loadRealtimeModule(path){
 let resolveAuth;
 let removeCalls=0,disconnectCalls=0,handlerRegistrations=0,subscribeCalls=0;
 const channel={
  on(){handlerRegistrations++;return this;},
  subscribe(){subscribeCalls++;return this;}
 };
 const client={
  channel(){return channel;},
  realtime:{
   setAuth(){return new Promise(resolve=>{resolveAuth=resolve;});},
   disconnect(){disconnectCalls++;}
  },
  removeChannel(){removeCalls++;return Promise.resolve('ok');}
 };
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{
   module:ts.ModuleKind.CommonJS,
   target:ts.ScriptTarget.ES2020
  }
 }).outputText;
 const module={exports:{}};
 const mockRequire=id=>{
  if(id==='@supabase/supabase-js')return {createClient:()=>client};
  if(id==='./supabase-rest')return {apiUrl:'https://supabase.invalid',backendReady:true};
  if(id==='./realtime-cleanup')return {removeRealtimeChannelWithDeadline};
  throw new Error('Unexpected module: '+id);
 };
 runInNewContext(compiled,{
  module,
  exports:module.exports,
  require:mockRequire,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon-key'}},
  window:{}
 },{filename:path});
 return {
  exports:module.exports,
  resolveAuth:()=>resolveAuth(),
  counts:()=>({removeCalls,disconnectCalls,handlerRegistrations,subscribeCalls})
 };
}

test('cleanup before JWT authorization resolves never starts direct, group or inbox subscriptions',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path);
  const start=loaded.exports[exportName];
  assert.equal(typeof start,'function',path);
  const stop=start('test-user-jwt',UUID,()=>{});
  stop();

  assert.equal(loaded.counts().removeCalls,1,path+' removes its channel');
  loaded.resolveAuth();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' must not subscribe after disposal');
 }
});
