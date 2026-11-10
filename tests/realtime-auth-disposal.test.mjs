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

function loadRealtimeModule(path,authTimeoutMs=10000,options={}){
 let resolveAuth,rejectAuth;
 let removeCalls=0,disconnectCalls=0,handlerRegistrations=0,subscribeCalls=0;
 const eventCallbacks=[];
 let statusCallback=null;
 const channel={
  on(_event,_filter,callback){
   handlerRegistrations++;
   if(typeof callback==='function')eventCallbacks.push(callback);
   return this;
  },
  subscribe(callback){
   subscribeCalls++;
   if(options.throwOnSubscribe)throw new Error('channel subscribe failed synchronously');
   if(typeof callback==='function')statusCallback=callback;
   return this;
  }
 };
 const client={
  channel(){return channel;},
  realtime:{
   setAuth(){
    if(options.throwOnSetAuth)throw new Error('setAuth failed synchronously');
    return new Promise((resolve,reject)=>{resolveAuth=resolve;rejectAuth=reject;});
   },
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
  if(id==='./realtime-cleanup')return {
   authorizeRealtimeWithDeadline:(authorize,onAuthorized,onFailure)=>(
    authorizeRealtimeWithDeadline(authorize,onAuthorized,onFailure,authTimeoutMs)
   ),
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
 return {
  exports:module.exports,
  resolveAuth:()=>resolveAuth(),
  rejectAuth:()=>rejectAuth(new Error('expired token')),
  emitRealtimeEvents:()=>eventCallbacks.forEach(callback=>callback()),
  emitStatus:status=>statusCallback?.(status),
  counts:()=>({removeCalls,disconnectCalls,handlerRegistrations,subscribeCalls})
 };
}

const pause=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

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

test('late Realtime events and SUBSCRIBED callbacks after cleanup are ignored',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path);
  let changed=0;
  const stop=loaded.exports[exportName]('test-user-jwt',UUID,()=>{changed++;});
  loaded.resolveAuth();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(loaded.counts().subscribeCalls,1,path+' establishes its channel');
  assert.ok(loaded.counts().handlerRegistrations>0,path+' registers change handlers');

  loaded.emitRealtimeEvents();
  loaded.emitStatus('SUBSCRIBED');
  const beforeDispose=changed;
  assert.ok(beforeDispose>0,path+' delivers active channel notifications');

  stop();
  loaded.emitRealtimeEvents();
  loaded.emitStatus('SUBSCRIBED');

  assert.equal(changed,beforeDispose,path+' ignores callbacks queued after disposal');
 }
});

test('repeated cleanup calls remove each direct, group and inbox channel only once',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path);
  const stop=loaded.exports[exportName]('test-user-jwt',UUID,()=>{});

  stop();
  stop();
  stop();
  await Promise.resolve();

  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' cleanup must be idempotent');
 }
});

test('failed JWT authorization releases direct, group and inbox clients without subscribing',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path);
  const stop=loaded.exports[exportName]('expired-user-jwt',UUID,()=>{});

  loaded.rejectAuth();
  await pause();

  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' releases its channel and socket after auth failure');

  stop();
  await pause();
  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' later React cleanup remains idempotent');
 }
});

test('a stalled JWT authorization is bounded and releases every Realtime client',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path,8);
  const stop=loaded.exports[exportName]('offline-user-jwt',UUID,()=>{});

  await pause(20);
  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' must release its channel and socket when setAuth stalls');

  // A late success after the timeout must not revive the disposed channel.
  loaded.resolveAuth();
  await pause();
  stop();
  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' ignores authorization completion after its deadline');
 }
});

test('successful JWT authorization clears its deadline and keeps the channel alive',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path,8);
  const stop=loaded.exports[exportName]('valid-user-jwt',UUID,()=>{});
  loaded.resolveAuth();
  await Promise.resolve();
  await Promise.resolve();
  await pause(20);

  assert.equal(loaded.counts().removeCalls,0,path+' does not remove an authorized channel');
  assert.equal(loaded.counts().disconnectCalls,0,path+' clears the auth watchdog after success');
  assert.equal(loaded.counts().subscribeCalls,1,path+' subscribes after authorization');

  stop();
  await pause();
  assert.equal(loaded.counts().removeCalls,1,path+' cleans up normally');
  assert.equal(loaded.counts().disconnectCalls,1,path+' disconnects normally');
 }
});

test('synchronous setAuth exceptions release direct, group and inbox clients',async()=>{
 for(const [path,exportName] of modules){
  const loaded=loadRealtimeModule(path,10000,{throwOnSetAuth:true});
  const stop=loaded.exports[exportName]('invalid-user-jwt',UUID,()=>{});

  await pause();
  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' releases its client when setAuth throws before returning a Promise');

  stop();
  await pause();
  assert.deepEqual(loaded.counts(),{
   removeCalls:1,
   disconnectCalls:1,
   handlerRegistrations:0,
   subscribeCalls:0
  },path+' later cleanup remains idempotent after synchronous auth failure');
 }
});

test('synchronous channel subscribe exceptions dispose partially registered direct, group and inbox handlers',async()=>{
 for(const [path,exportName] of modules){
  let changed=0;
  const loaded=loadRealtimeModule(path,10000,{throwOnSubscribe:true});
  const stop=loaded.exports[exportName]('valid-user-jwt',UUID,()=>{changed++;});

  loaded.resolveAuth();
  await pause();
  assert.ok(loaded.counts().handlerRegistrations>0,path+' registers handlers before SDK subscribe');
  assert.deepEqual({
   removeCalls:loaded.counts().removeCalls,
   disconnectCalls:loaded.counts().disconnectCalls,
   subscribeCalls:loaded.counts().subscribeCalls
  },{
   removeCalls:1,
   disconnectCalls:1,
   subscribeCalls:1
  },path+' tears down the partially initialized client after subscribe throws');

  loaded.emitRealtimeEvents();
  loaded.emitStatus('SUBSCRIBED');
  assert.equal(changed,0,path+' ignores handlers left behind by failed startup');

  stop();
  await pause();
  assert.deepEqual({
   removeCalls:loaded.counts().removeCalls,
   disconnectCalls:loaded.counts().disconnectCalls
  },{
   removeCalls:1,
   disconnectCalls:1
  },path+' remains safe when React cleanup runs after startup failure');
 }
});
