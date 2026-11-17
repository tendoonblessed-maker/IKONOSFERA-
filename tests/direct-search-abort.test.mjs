import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const CHAT='11111111-1111-4111-8111-111111111111';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function loadApi(fetch){
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
  fetch,AbortSignal,AbortController,URLSearchParams,URL,Date,Math,JSON,
  Promise,Map,Set,Error,DOMException,setTimeout,clearTimeout
 };
 vm.runInNewContext(compiled,context,{filename:'supabase-rest.cjs',timeout:2500});
 return exports;
}

test('direct search forwards the user abort signal and preserves the scoped RPC request',async()=>{
 const rows=[{id:'message-1',chat_id:CHAT,body:'hello'}];
 let request;
 const api=loadApi(async(url,options)=>{
  request={url,options};
  return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
 });
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
});

test('aborting a direct search cancels its in-flight HTTP request',async()=>{
 let requestSignal;
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
 });
 const controller=new AbortController();
 const pending=api.searchDirectMessages('user-jwt',CHAT,'message',0,controller.signal);
 await Promise.resolve();
 assert.ok(requestSignal);
 assert.equal(requestSignal.aborted,false);
 controller.abort();
 await assert.rejects(pending,error=>['AbortError','TimeoutError'].includes(error.name));
 assert.equal(requestSignal.aborted,true);
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
