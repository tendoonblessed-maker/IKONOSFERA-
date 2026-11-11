import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {fetchWithTimeout} from '../lib/fetch-timeout.mjs';

const GROUP='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const MESSAGE='33333333-3333-4333-8333-333333333333';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ok=data=>({ok:true,json:async()=>data});

function setup(handler=()=>ok([])){
 const source=read('lib/groups.ts');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const calls=[];
 const exports={};
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  },
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit.test'};
   if(name==='@/lib/fetch-timeout.mjs')return {fetchWithTimeout};
   throw new Error('Unexpected import: '+name);
  }
 };
 // Deliberately omit AbortSignal: older WebViews must not fail before fetch.
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'groups.cjs'});
 return {api:exports,calls};
}

test('group GET requests use the portable deadline without a global AbortSignal',async()=>{
 const {api,calls}=setup();
 const groups=await api.listGroups('signed-user-jwt');
 assert.deepEqual(groups,[]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.cache,'no-store');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
 const source=read('lib/groups.ts');
 assert.match(source,/fetchWithTimeout\(fetch,url,init,timeoutMs\?\?GROUP_REQUEST_TIMEOUT_MS/);
 assert.match(source,/GROUP_REQUEST_TIMEOUT_MS=18000/);
 assert.doesNotMatch(source,/AbortSignal\.timeout/);
});

test('group history reads preserve caller cancellation through the portable deadline',async()=>{
 const owner=new AbortController();
 const reason=Object.assign(new Error('group changed'),{name:'AbortError'});
 const {api,calls}=setup((_url,options)=>new Promise((_resolve,reject)=>{
  options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
 }));
 const pending=api.groupMessages('signed-user-jwt',GROUP,owner.signal);
 assert.equal(calls.length,1);
 owner.abort(reason);
 await assert.rejects(pending,error=>error===reason);
 assert.equal(calls[0].options.signal.aborted,true);
});

test('group history reads preserve caller cancellation during response body parsing',async()=>{
 const owner=new AbortController();
 const reason=Object.assign(new Error('group hidden'),{name:'AbortError'});
 let bodyStarted;
 const started=new Promise(resolve=>{bodyStarted=resolve;});
 const {api,calls}=setup(()=>({ok:true,json:()=>{bodyStarted();return new Promise(()=>{});}}));
 const pending=api.groupMessages('signed-user-jwt',GROUP,owner.signal);
 await started;
 owner.abort(reason);
 await assert.rejects(pending,error=>error===reason);
 assert.equal(calls[0].options.signal.aborted,true);
 assert.match(read('lib/groups.ts'),/error\.name==='AbortError'\|\|error\.name==='TimeoutError'/);
});

test('read-only group overview RPC POST has a portable deadline too',async()=>{
 const {api,calls}=setup(()=>ok([]));
 const overviews=await api.listGroupOverviews('signed-user-jwt');
 assert.deepEqual(overviews,[]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.body,'{}');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.cache,'no-store');
 assert.equal(calls[0].options.headers.Prefer,'return=representation');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
 assert.match(read('lib/groups.ts'),/list_group_overviews','POST',\{\}, \{\}, GROUP_REQUEST_TIMEOUT_MS\)/);
});

test('idempotent group POST and read-after-write GET both use portable deadlines',async()=>{
 const message={id:MESSAGE,group_id:GROUP,sender_id:USER,body:'hello',created_at:'2026-11-07T12:00:00Z'};
 const {api,calls}=setup((_url,options,index)=>options.method==='POST'?ok([]):ok([message]));
 const result=await api.sendGroupMessage('signed-user-jwt',GROUP,USER,' hello ',MESSAGE);
 assert.equal(result.id,MESSAGE);
 assert.equal(result.body,'hello');
 assert.deepEqual(calls.map(call=>call.options.method),['POST','GET']);
 for(const call of calls){
  assert.ok(call.options.signal instanceof AbortSignal);
  assert.equal(call.options.cache,'no-store');
  assert.equal(call.options.headers.Authorization,'Bearer signed-user-jwt');
 }
 assert.match(calls[0].url,/on_conflict=id/);
 assert.equal(calls[0].options.headers.Prefer,'resolution=ignore-duplicates,return=representation');
 assert.match(calls[1].url,/id=eq\./);
});

test('group API no longer evaluates AbortSignal.timeout on any path',()=>{
 const source=read('lib/groups.ts');
 assert.doesNotMatch(source,/AbortSignal\.timeout/);
 assert.match(source,/method==='GET'\|\|timeoutMs!==undefined\|\|signal!==undefined/);
 assert.match(source,/GROUP_REQUEST_TIMEOUT_MS\);/);
});
