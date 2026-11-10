import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {fetchWithTimeout} from '../lib/fetch-timeout.mjs';

const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

function setup(handler){
 const calls=[];
 const exports={};
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://unit.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-anon'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options);
  },
  require(name){
   if(name==='./fetch-timeout.mjs')return {fetchWithTimeout};
   throw new Error('Unexpected module: '+name);
  }
 };
 // Deliberately omit AbortSignal: older mobile browsers must still issue requests.
 vm.runInNewContext(compiled,context,{timeout:2500,filename:'supabase-rest.cjs'});
 return {api:exports,calls};
}

test('core Supabase HTTP requests use portable AbortController deadlines',async()=>{
 const profile={id:'11111111-1111-4111-8111-111111111111',username:'tester',display_name:'Tester'};
 const {api,calls}=setup(async()=>({
  ok:true,status:200,text:async()=>JSON.stringify([profile])
 }));
 const result=await api.myProfile('signed-user-jwt',profile.id);
 assert.equal(result.id,profile.id);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.cache,'no-store');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
 assert.ok(source.includes('fetchWithTimeout(fetch,'));
 assert.ok(source.includes('SUPABASE_HTTP_TIMEOUT_MS = 18000'));
 const httpStart=source.indexOf('async function http');
 const httpEnd=source.indexOf('export function loadSession',httpStart);
 assert.ok(httpStart>=0&&httpEnd>httpStart);
 assert.ok(!source.slice(httpStart,httpEnd).includes('AbortSignal.timeout'));
});

test('core Supabase HTTP deadline also bounds mutating requests without automatic retries',async()=>{
 const {api,calls}=setup(async()=>({
  ok:true,status:200,text:async()=>JSON.stringify('chat-id')
 }));
 const result=await api.startDirectChat('signed-user-jwt','friend');
 assert.equal(result,'chat-id');
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('the same deadline aborts a response whose text body stalls after headers',async()=>{
 let signal;
 const pending=fetchWithTimeout(async(_url,init)=>{
  signal=init.signal;
  return {text:()=>new Promise(()=>{})};
 },'/slow-text',{},5,'Тело ответа не завершилось вовремя.').then(response=>response.text());
 await assert.rejects(pending,/Тело ответа не завершилось вовремя/);
 assert.equal(signal.aborted,true);
});

test('the same deadline aborts a response whose JSON body stalls after headers',async()=>{
 let signal;
 const pending=fetchWithTimeout(async(_url,init)=>{
  signal=init.signal;
  return {json:()=>new Promise(()=>{})};
 },'/slow-json',{},5,'JSON-ответ не завершился вовремя.').then(response=>response.json());
 await assert.rejects(pending,/JSON-ответ не завершился вовремя/);
 assert.equal(signal.aborted,true);
});

test('a completed response body clears the deadline and preserves ordinary stream errors',async()=>{
 let signal;
 const response={text:async()=> 'ok'};
 const result=await fetchWithTimeout(async(_url,init)=>{
  signal=init.signal;
  return response;
 },'/fast-body',{},5).then(value=>value.text());
 assert.equal(result,'ok');
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(signal.aborted,false);

 const streamError=new TypeError('connection reset while reading body');
 await assert.rejects(
  fetchWithTimeout(async()=>({text:()=>Promise.reject(streamError)}),'/broken-body',{},50)
   .then(value=>value.text()),
  error=>error===streamError
 );
});
