import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const SOURCE=readFileSync(new URL('../lib/groups.ts',import.meta.url),'utf8');
const COMPILED=ts.transpileModule(SOURCE,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;

function createHarness({nativeTimeout=true,fetchImpl}={}){
 const calls=[];
 const timeouts=[];
 const signals=[];
 const timers=[];
 const exports={};
 const fakeFetch=fetchImpl??(async(url,options)=>{
  calls.push({url,options});
  return {
   ok:true,
   json:async()=>url.endsWith('/rpc/create_group_chat')?'group-id':[]
  };
 });
 class FakeAbortController{
  constructor(){
   const listeners=new Set();
   this.signal={
    aborted:false,
    addEventListener(type,listener){if(type==='abort')listeners.add(listener);},
    removeEventListener(type,listener){if(type==='abort')listeners.delete(listener);}
   };
   this.abort=()=>{
    if(this.signal.aborted)return;
    this.signal.aborted=true;
    for(const listener of listeners)listener();
   };
   signals.push(this.signal);
  }
 }
 const AbortSignalShim=nativeTimeout?{
  timeout(milliseconds){
   const signal={timeout:milliseconds,aborted:false};
   timeouts.push(milliseconds);
   signals.push(signal);
   return signal;
  }
 }:{};
 const fakeSetTimeout=(callback,milliseconds)=>{
  const timer={callback,milliseconds,cleared:false};
  timers.push(timer);
  return timer;
 };
 const fakeClearTimeout=timer=>{if(timer)timer.cleared=true;};
 vm.runInNewContext(COMPILED,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon-key'}},
  Promise,Error,JSON,encodeURIComponent,
  AbortSignal:AbortSignalShim,
  AbortController:FakeAbortController,
  setTimeout:fakeSetTimeout,
  clearTimeout:fakeClearTimeout,
  fetch:fakeFetch,
  require(specifier){
   if(specifier==='@/lib/supabase-rest')return {apiUrl:'https://supabase.test'};
   throw new Error('Unexpected module: '+specifier);
  }
 },{timeout:1000,filename:'lib/groups.ts'});
 return {api:exports,calls,timeouts,signals,timers};
}

test('read-only group overview RPC has an explicit 18-second native deadline',async()=>{
 const h=createHarness();
 const result=await h.api.listGroupOverviews('user-jwt');
 assert.deepEqual(result,[]);
 assert.equal(h.calls.length,1);
 const {url,options}=h.calls[0];
 assert.equal(url,'https://supabase.test/rest/v1/rpc/list_group_overviews');
 assert.equal(options.method,'POST');
 assert.equal(options.signal,h.signals[0]);
 assert.equal(options.signal.timeout,18_000);
 assert.deepEqual(h.timeouts,[18_000]);
 assert.equal(options.cache,'no-store');
 assert.equal(options.headers.Authorization,'Bearer user-jwt');
 assert.equal(options.headers.apikey,'test-anon-key');
});

test('ordinary group list GET keeps the existing bounded native-read behavior',async()=>{
 const h=createHarness();
 await h.api.listGroups('user-jwt');
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].options.method,'GET');
 assert.equal(h.calls[0].options.signal,h.signals[0]);
 assert.deepEqual(h.timeouts,[18_000]);
});

test('non-idempotent group creation is not given an automatic abort deadline',async()=>{
 const h=createHarness();
 const result=await h.api.createGroup('user-jwt','Test group',[]);
 assert.equal(result,'group-id');
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].options.method,'POST');
 assert.equal(h.calls[0].options.signal,undefined);
 assert.deepEqual(h.timeouts,[]);
});

test('read-only overview and ordinary GET use a portable timer when AbortSignal.timeout is absent',async()=>{
 const h=createHarness({nativeTimeout:false});
 await h.api.listGroupOverviews('user-jwt');
 await h.api.listGroups('user-jwt');
 assert.equal(h.calls.length,2);
 assert.deepEqual(h.timers.map(timer=>timer.milliseconds),[18_000,18_000]);
 assert.ok(h.timers.every(timer=>timer.cleared),'portable timers must be cleared after responses');
 assert.equal(h.calls[0].options.signal,h.signals[0]);
 assert.equal(h.calls[1].options.signal,h.signals[1]);
 assert.ok(h.signals.every(signal=>signal.aborted===false));
});

test('portable deadline aborts a stalled response body and does not swallow the abort',async()=>{
 const h=createHarness({nativeTimeout:false,fetchImpl:async(url,options)=>{
  h.calls.push({url,options});
  return {ok:true,json:()=>new Promise((resolve,reject)=>{
   const abort=()=>reject(new Error('body aborted by deadline'));
   if(options.signal.aborted)abort();
   else options.signal.addEventListener('abort',abort);
  })};
 }});
 const pending=h.api.listGroupOverviews('user-jwt');
 assert.equal(h.timers.length,1);
 h.timers[0].callback();
 await assert.rejects(pending,/body aborted by deadline/);
 assert.equal(h.signals[0].aborted,true);
 assert.equal(h.timers[0].cleared,true);
});

test('idempotent group send uses a portable deadline and clears it after confirmation',async()=>{
 const groupId='11111111-1111-1111-1111-111111111111';
 const userId='22222222-2222-2222-2222-222222222222';
 const messageId='33333333-3333-3333-3333-333333333333';
 const h=createHarness({nativeTimeout:false,fetchImpl:async(url,options)=>{
  h.calls.push({url,options});
  return {ok:true,json:async()=>[{
   id:messageId,group_id:groupId,sender_id:userId,body:'hello',created_at:'2026-11-20T00:00:00Z'
  }]};
 }});
 const row=await h.api.sendGroupMessage('user-jwt',groupId,userId,'hello',messageId);
 assert.equal(row.id,messageId);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].options.method,'POST');
 assert.equal(h.calls[0].options.signal,h.signals[0]);
 assert.deepEqual(h.timers.map(timer=>timer.milliseconds),[18_000]);
 assert.equal(h.timers[0].cleared,true);
 assert.equal(h.calls[0].options.headers.Prefer,'resolution=ignore-duplicates,return=representation');
});
