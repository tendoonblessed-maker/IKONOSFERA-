import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {
 authorizeRealtimeWithDeadline,
 removeRealtimeChannelWithDeadline
} from '../lib/realtime-cleanup.ts';

const UUID='11111111-1111-4111-8111-111111111111';
const modules=[
 ['lib/direct-realtime.ts','subscribeDirectChatChanges'],
 ['lib/group-realtime.ts','subscribeGroupChanges'],
 ['lib/inbox-realtime.ts','subscribeInboxChanges']
];

function makeClient(){
 let statusCallback=null;
 let removeCalls=0,disconnectCalls=0,subscribeCalls=0;
 const eventCallbacks=[];
 const channel={
  on(_event,_filter,callback){
   if(typeof callback==='function')eventCallbacks.push(callback);
   return this;
  },
  subscribe(callback){
   subscribeCalls++;
   if(typeof callback==='function')statusCallback=callback;
   return this;
  }
 };
 const client={
  channel(){return channel;},
  realtime:{
   setAuth(){return Promise.resolve();},
   disconnect(){disconnectCalls++;}
  },
  removeChannel(){removeCalls++;return Promise.resolve('ok');}
 };
 return {
  client,
  emitEvents(){for(const callback of eventCallbacks)callback();},
  emitStatus(status){statusCallback?.(status);},
  counts(){return {removeCalls,disconnectCalls,subscribeCalls};}
 };
}

function loadRealtimeModule(path){
 const clients=[];
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{
   module:ts.ModuleKind.CommonJS,
   target:ts.ScriptTarget.ES2020
  }
 }).outputText;
 const module={exports:{}};
 const mockRequire=id=>{
  if(id==='@supabase/supabase-js')return {
   createClient:()=>{
    const harness=makeClient();
    clients.push(harness);
    return harness.client;
   }
  };
  if(id==='./supabase-rest')return {apiUrl:'https://supabase.invalid',backendReady:true};
  if(id==='./realtime-cleanup')return {
   authorizeRealtimeWithDeadline,
   removeRealtimeChannelWithDeadline
  };
  throw new Error('Unexpected module: '+id);
 };
 runInNewContext(compiled,{
  module,
  exports:module.exports,
  require:mockRequire,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon-key'}},
  window:{}
 },{filename:path});
 return {start:module.exports,clients};
}

const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

test('tearing down one overlapping chat subscription never disconnects another client',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path);
  let firstChanges=0,secondChanges=0;
  const stopFirst=loaded.start[exportName]('first-user-jwt',UUID,()=>{firstChanges++;});
  const stopSecond=loaded.start[exportName]('second-user-jwt',UUID,()=>{secondChanges++;});

  await pause();
  assert.equal(loaded.clients.length,2,path+' creates one isolated SDK client per subscription');
  assert.equal(loaded.clients[0].counts().subscribeCalls,1,path+' first subscription is active');
  assert.equal(loaded.clients[1].counts().subscribeCalls,1,path+' second subscription is active');

  loaded.clients[0].emitEvents();
  loaded.clients[1].emitEvents();
  const firstBeforeCleanup=firstChanges;
  const secondBeforeCleanup=secondChanges;
  assert.ok(firstBeforeCleanup>0,path+' first subscription receives active events');
  assert.ok(secondBeforeCleanup>0,path+' second subscription receives active events');

  stopFirst();
  await pause();
  assert.deepEqual(loaded.clients[0].counts(),{
   removeCalls:1,disconnectCalls:1,subscribeCalls:1
  },path+' only the first client is torn down');
  assert.deepEqual(loaded.clients[1].counts(),{
   removeCalls:0,disconnectCalls:0,subscribeCalls:1
  },path+' second client remains connected');

  loaded.clients[0].emitEvents();
  loaded.clients[0].emitStatus('SUBSCRIBED');
  assert.equal(firstChanges,firstBeforeCleanup,path+' ignores first-client callbacks after cleanup');

  loaded.clients[1].emitEvents();
  loaded.clients[1].emitStatus('SUBSCRIBED');
  assert.ok(secondChanges>secondBeforeCleanup,path+' second client still delivers events');

  stopSecond();
  await pause();
  assert.deepEqual(loaded.clients[1].counts(),{
   removeCalls:1,disconnectCalls:1,subscribeCalls:1
  },path+' second client cleans up independently');
 }
});
