import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const CHAT='11111111-1111-4111-8111-111111111111';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function loadApi(fetch,overrides={}){
 const source=read('lib/supabase-rest.ts');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={};
 const context={
  exports,
  process:{env:{
   NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.invalid',
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon-test'
  }},
  fetch,AbortSignal:overrides.AbortSignal??AbortSignal,
  AbortController,URLSearchParams,URL,Date,Math,JSON,
  Promise,Map,Set,Error,DOMException,
  setTimeout:overrides.setTimeout??setTimeout,
  clearTimeout:overrides.clearTimeout??clearTimeout
 };
 vm.runInNewContext(compiled,context,{filename:'supabase-rest.cjs',timeout:2500});
 return exports;
}

function fakeTimers(){
 let nextId=0;
 const timers=new Map();
 const scheduled=[];
 const cleared=[];
 return {
  setTimeout(callback,delay){
   const id=++nextId;
   scheduled.push(delay);
   timers.set(id,callback);
   return id;
  },
  clearTimeout(id){cleared.push(id);timers.delete(id);},
  runNext(){
   const entry=timers.entries().next().value;
   if(!entry)return false;
   const [id,callback]=entry;
   timers.delete(id);
   callback();
   return true;
  },
  get pending(){return timers.size;},
  scheduled,cleared
 };
}

test('direct search forwards the user abort signal and preserves the scoped RPC request',async()=>{
 const rows=[{id:'message-1',chat_id:CHAT,body:'hello'}];
 let request;
 const timers=fakeTimers();
 const api=loadApi(async(url,options)=>{
  request={url,options};
  return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
 },{AbortSignal:{},setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout});
 const controller=new AbortController();
 const result=await api.searchDirectMessages('user-jwt',CHAT,' hello ',30,controller.signal);
 assert.deepEqual(result,rows);
 assert.equal(request.url,'https://test.supabase.invalid/rest/v1/rpc/search_direct_messages');
 assert.equal(request.options.method,'POST');
 assert.equal(request.options.headers.Authorization,'Bearer user-jwt');
 assert.equal(request.options.headers.apikey,'anon-test');
 assert.equal(request.options.cache,'no-store');
 assert.notEqual(request.options.signal,controller.signal,
  'the request signal must also retain the built-in network timeout');
 const body=JSON.parse(request.options.body);
 assert.deepEqual(body,{
  p_chat_id:CHAT,p_query:'hello',p_limit:31,p_offset:30
 });
 assert.deepEqual(timers.scheduled,[18000]);
 assert.equal(timers.pending,0,'successful response clears its deadline');
 assert.deepEqual(timers.cleared,[1]);
});

test('aborting a direct search cancels its in-flight HTTP request',async()=>{
 let requestSignal;
 const timers=fakeTimers();
 const api=loadApi(async(_url,options)=>{
  requestSignal=options.signal;
  return new Promise((_resolve,reject)=>{
   if(options.signal.aborted){
    reject(options.signal.reason??new DOMException('Aborted','AbortError'));
    return;
   }
   options.signal.addEventListener('abort',()=>{
    reject(options.signal.reason??new DOMException('Aborted','AbortError'));
   },{once:true});
  });
 },{AbortSignal:{},setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout});
 const controller=new AbortController();
 const pending=api.searchDirectMessages('user-jwt',CHAT,'message',0,controller.signal);
 await Promise.resolve();
 assert.ok(requestSignal);
 assert.equal(requestSignal.aborted,false);
 controller.abort();
 await assert.rejects(pending,error=>['AbortError','TimeoutError'].includes(error.name));
 assert.equal(requestSignal.aborted,true);
 assert.equal(timers.pending,0,'caller cancellation clears the deadline');
 assert.deepEqual(timers.cleared,[1]);
});

test('the 18-second deadline works without AbortSignal.timeout or AbortSignal.any',async()=>{
 let requestSignal;
 const timers=fakeTimers();
 const api=loadApi(async(_url,options)=>{
  requestSignal=options.signal;
  return new Promise((_resolve,reject)=>{
   options.signal.addEventListener('abort',()=>{
    reject(options.signal.reason??new DOMException('Aborted','AbortError'));
   },{once:true});
  });
 },{AbortSignal:{},setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout});
 const pending=api.searchDirectMessages('user-jwt',CHAT,'message',0);
 await Promise.resolve();
 assert.ok(requestSignal);
 assert.deepEqual(timers.scheduled,[18000]);
 assert.equal(timers.runNext(),true);
 await assert.rejects(pending,error=>error.name==='TimeoutError');
 assert.equal(requestSignal.aborted,true);
 assert.equal(timers.pending,0);
 assert.deepEqual(timers.cleared,[1]);
});

test('closing or changing direct search aborts its request and invalidates late completion',()=>{
 const shell=read('components/AppShell.tsx');
 const start=shell.indexOf('// Full-history search uses a scoped, security-invoker database RPC.');
 const end=shell.indexOf('  function resetMessageSearch(){',start);
 assert.ok(start>=0&&end>start);
 const effect=shell.slice(start,end);
 assert.match(effect,/const controller=new AbortController\(\)/);
 assert.match(effect,/searchDirectMessages\(token,chatId,term,offset,controller\.signal\)/);
 assert.match(effect,/if\(messageSearchRequestRef\.current===requestId\)messageSearchRequestRef\.current\+\+/);
 assert.match(effect,/controller\.abort\(\)/);
 assert.match(effect,/if\(belongs\(\)&&!controller\.signal\.aborted\)setMessageSearchError\(true\)/);
 assert.match(effect,/if\(belongs\(\)&&!controller\.signal\.aborted\)setMessageSearchLoading\(false\)/);
});
