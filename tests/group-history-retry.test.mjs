import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {retryTransientHistoryRead} from '../lib/history-retry.js';

const GROUP='11111111-1111-4111-8111-111111111111';
const USER='33333333-3333-4333-8333-333333333333';
const stamp='2026-11-15T18:00:00.123456Z';
const id=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const row=n=>({id:id(n),group_id:GROUP,sender_id:USER,body:'message '+n,created_at:stamp});
const source=readFileSync(new URL('../lib/group-pagination.ts',import.meta.url),'utf8');

function setup(handler){
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const calls=[];
 const exports={};
 const context={
  exports,URLSearchParams,URL,AbortSignal,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  },
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit.test'};
   if(name==='./history-retry.js')return {retryTransientHistoryRead};
   throw new Error('Unexpected import: '+name);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'group-pagination.cjs'});
 return {api:exports,calls};
}
function response(status,body,retryAfter=null){
 return {
  ok:status>=200&&status<300,
  status,
  headers:{get(name){return name.toLowerCase()==='retry-after'?retryAfter:null;}},
  json:async()=>body
 };
}

test('older group-history GET retries a transient 503 with the identical scoped request',async()=>{
 const {api,calls}=setup(()=>calls.length===1
  ?response(503,{message:'temporarily unavailable'},'0')
  :response(200,[row(2),row(1)]));
 const page=await api.fetchOlderGroupMessages('signed-user-jwt',GROUP,{
  id:id(3),created_at:stamp
 });
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,calls[1].url);
 assert.match(calls[0].url,/group_id=eq\.11111111-1111-4111-8111-111111111111/);
 assert.match(calls[0].url,/id\.lt\./);
 for(const call of calls){
  assert.equal(call.options.method,'GET');
  assert.equal(call.options.cache,'no-store');
  assert.equal(call.options.headers.Authorization,'Bearer signed-user-jwt');
  assert.equal(call.options.headers.apikey,'public-test');
  assert.ok(call.options.signal instanceof AbortSignal);
 }
 assert.deepEqual(Array.from(page.messages,x=>x.id),[id(1),id(2)]);
 assert.equal(page.hasMore,false);
});

test('network TypeError is retried once for older group history',async()=>{
 let attempts=0;
 const {api}=setup(()=>{
  attempts++;
  if(attempts===1)throw new TypeError('network unavailable');
  return response(200,[]);
 });
 const page=await api.fetchOlderGroupMessages('jwt',GROUP,{id:id(3),created_at:stamp});
 assert.equal(attempts,2);
 assert.deepEqual(Array.from(page.messages),[]);
});

test('group history does not retry permanent HTTP errors or a long Retry-After',async()=>{
 for(const first of [
  response(401,{message:'unauthorized'}),
  response(429,{message:'rate limited'},'4')
 ]){
  let attempts=0;
  const {api}=setup(()=>{attempts++;return first;});
  await assert.rejects(api.fetchOlderGroupMessages('jwt',GROUP,{id:id(3),created_at:stamp}));
  assert.equal(attempts,1);
 }
});

test('group history does not retry aborts, timeouts or malformed successful payloads',async()=>{
 for(const name of ['AbortError','TimeoutError']){
  let attempts=0;
  const {api}=setup(()=>{
   attempts++;
   const error=new Error(name);error.name=name;throw error;
  });
  await assert.rejects(api.fetchOlderGroupMessages('jwt',GROUP,{id:id(3),created_at:stamp}));
  assert.equal(attempts,1);
 }
 let malformedAttempts=0;
 const {api}=setup(()=>{malformedAttempts++;return response(200,{unexpected:true});});
 await assert.rejects(api.fetchOlderGroupMessages('jwt',GROUP,{id:id(3),created_at:stamp}));
 assert.equal(malformedAttempts,1);
});
