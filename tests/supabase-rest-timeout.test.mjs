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
 assert.match(source,/fetchWithTimeout\(fetch,/);
 assert.match(source,/SUPABASE_HTTP_TIMEOUT_MS\s*=\s*18000/);
 assert.doesNotMatch(source,/AbortSignal\.timeout/);
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
