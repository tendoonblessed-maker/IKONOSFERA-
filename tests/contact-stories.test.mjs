import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const VALID='11111111-2222-4333-8444-555555555555';
const INVALID=['a'.repeat(36),'11111111-2222-4333-8444-55555555555g','111111112222-4333-8444-555555555555'];
const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');

function setup(){
 const calls=[];
 const exports={};
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 vm.runInNewContext(compiled,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon'}},
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://test.invalid'};
  },
  fetch:async(url,options)=>{
   calls.push({url,options});
   return {ok:true,json:async()=>[]};
  }
 },{filename:'social.cjs',timeout:2500});
 return {api:exports,calls};
}

test('malformed contact UUIDs do not break valid contacts story query',async()=>{
 const {api,calls}=setup();
 await api.getContactsStories('user-jwt',[...INVALID,VALID.toUpperCase(),VALID]);
 assert.equal(calls.length,1);
 const url=new URL(calls[0].url);
 assert.equal(url.pathname,'/rest/v1/stories');
 assert.equal(url.searchParams.get('user_id'),'in.('+VALID+')');
 assert.equal(url.searchParams.get('order'),'created_at.desc');
 assert.equal(url.searchParams.get('limit'),'200');
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-jwt');
 assert.equal(calls[0].options.cache,'no-store');
});

test('invalid-only and empty contact lists never issue a request',async()=>{
 const {api,calls}=setup();
 assert.equal((await api.getContactsStories('jwt',[])).length,0);
 assert.equal((await api.getContactsStories('jwt',INVALID)).length,0);
 assert.equal(calls.length,0);
});

test('contact story filter is deduplicated and bounded to 100 valid UUIDs',async()=>{
 const {api,calls}=setup();
 const ids=Array.from({length:120},(_,i)=>
  '11111111-2222-4333-8444-'+i.toString(16).padStart(12,'0'));
 await api.getContactsStories('jwt',[ids[0].toUpperCase(),...ids,ids[0]]);
 assert.equal(calls.length,1);
 const filter=new URL(calls[0].url).searchParams.get('user_id');
 const queried=filter.slice(4,-1).split(',');
 assert.equal(queried.length,100);
 assert.equal(new Set(queried).size,100);
 assert.ok(queried.every(id=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)));
});
