import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const VALID='abcdefab-cdef-4abc-8def-abcdefabcdef';
const INVALID=['a'.repeat(36),'11111111-2222-4333-8444-55555555555g','111111112222-4333-8444-555555555555'];
const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');

function setup(handler=()=>[]){
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
   return {ok:true,json:async()=>handler(url,options,calls.length)};
  }
 },{filename:'social.cjs',timeout:2500});
 return {api:exports,calls};
}

function parsed(call){return new URL(call.url);}

test('malformed contact UUIDs do not break valid contacts story query',async()=>{
 const {api,calls}=setup();
 await api.getContactsStories('user-jwt',[...INVALID,VALID.toUpperCase(),VALID]);
 assert.equal(calls.length,1);
 const url=parsed(calls[0]);
 assert.equal(url.pathname,'/rest/v1/stories');
 assert.equal(url.searchParams.get('user_id'),'in.('+VALID+')');
 assert.equal(url.searchParams.get('order'),'created_at.asc,id.asc');
 assert.equal(url.searchParams.get('limit'),'200');
 assert.equal(url.searchParams.get('offset'),'0');
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-jwt');
 assert.equal(calls[0].options.cache,'no-store');
});

test('invalid-only and empty contact lists never issue a request',async()=>{
 const {api,calls}=setup();
 assert.equal((await api.getContactsStories('jwt',[])).length,0);
 assert.equal((await api.getContactsStories('jwt',INVALID)).length,0);
 assert.equal(calls.length,0);
});

test('contact IDs are deduplicated and split into bounded batches of 100',async()=>{
 const {api,calls}=setup();
 const ids=Array.from({length:120},(_,i)=>
  'abcdefab-cdef-4abc-8def-'+i.toString(16).padStart(12,'0'));
 await api.getContactsStories('jwt',[ids[0].toUpperCase(),...ids,ids[0]]);
 assert.equal(calls.length,2);
 const queried=calls.flatMap(call=>{
  const filter=parsed(call).searchParams.get('user_id');
  assert.ok(filter?.startsWith('in.(')&&filter.endsWith(')'));
  return filter.slice(4,-1).split(',');
 });
 assert.deepEqual(queried,[...ids].map(id=>id.toLowerCase()));
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('limit')),['200','200']);
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('offset')),['0','0']);
 assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer jwt'));
});

test('more than 200 active stories are paginated without truncation',async()=>{
 const rows=Array.from({length:202},(_,i)=>({id:String(i),user_id:VALID}));
 const {api,calls}=setup((url)=>{
  const offset=Number(parsed({url}).searchParams.get('offset'));
  return rows.slice(offset,offset+200);
 });
 const result=await api.getContactsStories('jwt',[VALID]);
 assert.equal(result.length,202);
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('offset')),['0','200']);
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('order')),['created_at.asc,id.asc','created_at.asc,id.asc']);
 assert.equal(parsed(calls[0]).searchParams.get('expires_at'),parsed(calls[1]).searchParams.get('expires_at'));
});
