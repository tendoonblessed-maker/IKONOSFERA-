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
 assert.equal(url.searchParams.get('offset'),null);
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
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('offset')),[null,null]);
 assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer jwt'));
});

test('keyset pagination does not skip later stories when earlier rows are deleted between pages',async()=>{
 const createdAt='2026-11-07T18:00:00.000000+00:00';
 const storyId=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
 const rows=Array.from({length:202},(_,i)=>({id:storyId(i),user_id:VALID,created_at:createdAt}));
 const {api,calls}=setup((url,options,callNumber)=>{
  const query=parsed({url});
  if(callNumber===2)rows.splice(0,10); // deletion before the saved cursor
  const filter=query.searchParams.get('or');
  if(!filter)return rows.slice(0,200);
  const marker='id.gt.';
  const markerAt=filter.lastIndexOf(marker);
  const cursorId=markerAt>=0?filter.slice(markerAt+marker.length,-2):'';
  assert.ok(/^[0-9a-f-]{36}$/i.test(cursorId),'second page must use a UUID keyset cursor');
  return rows.filter(row=>row.created_at>createdAt||(row.created_at===createdAt&&row.id>cursorId)).slice(0,200);
 });
 const result=await api.getContactsStories('jwt',[VALID]);
 assert.equal(result.length,202);
 assert.deepEqual(result.slice(-2).map(row=>row.id),[storyId(200),storyId(201)]);
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('limit')),['200','200']);
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('offset')),[null,null]);
 assert.deepEqual(calls.map(call=>parsed(call).searchParams.get('order')),['created_at.asc,id.asc','created_at.asc,id.asc']);
 assert.equal(parsed(calls[0]).searchParams.get('or'),null);
 assert.equal(parsed(calls[1]).searchParams.get('or'),'(created_at.gt.'+createdAt+',and(created_at.eq.'+createdAt+',id.gt.'+storyId(199)+'))');
 assert.equal(parsed(calls[0]).searchParams.get('expires_at'),parsed(calls[1]).searchParams.get('expires_at'));
});
