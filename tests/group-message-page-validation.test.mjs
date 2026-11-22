import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const GROUP='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const USER='33333333-3333-4333-8333-333333333333';
const id=(n)=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const stamp='2026-11-22T10:00:00.123456Z';
const row=(messageId=id(1),changes={})=>({
 id:messageId,group_id:GROUP,sender_id:USER,body:'Сообщение',created_at:stamp,...changes
});
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function setup(handler=()=>({ok:true,json:async()=>[]})){
 const compiled=ts.transpileModule(read('lib/groups.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const calls=[];
 const exports={};
 const context={
  exports,AbortSignal,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  },
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit.test'};
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'groups.cjs'});
 return {api:exports,calls};
}
const success=data=>({ok:true,json:async()=>data});

test('latest group page validates rows and returns the server-descending window chronologically',async()=>{
 const newest=row(id(2),{created_at:'2026-11-22T10:00:00.123457Z'});
 const oldest=row(id(1),{created_at:'2026-11-22T10:00:00.123456Z'});
 const {api,calls}=setup(()=>success([newest,oldest]));
 const messages=await api.groupMessages('signed-user-jwt',GROUP);
 assert.deepEqual(Array.from(messages,x=>x.id),[oldest.id,newest.id]);
 assert.equal(calls.length,1);
 const url=new URL(calls[0].url);
 assert.equal(url.pathname,'/rest/v1/group_messages');
 assert.equal(url.searchParams.get('group_id'),'eq.'+GROUP);
 assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
 assert.equal(url.searchParams.get('limit'),'150');
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.headers.apikey,'public-test');
 assert.equal(calls[0].options.cache,'no-store');
});

test('empty latest group page is valid',async()=>{
 const {api}=setup(()=>success([]));
 assert.deepEqual(Array.from(await api.groupMessages('jwt',GROUP)),[]);
});

test('rejects non-array and oversized latest snapshots',async()=>{
 const malformed=setup(()=>success({id:id(1)}));
 await assert.rejects(malformed.api.groupMessages('jwt',GROUP),/Некорректные данные истории группы/);
 const oversized=setup(()=>success(Array.from({length:151},(_,i)=>row(id(i+1)))));
 await assert.rejects(oversized.api.groupMessages('jwt',GROUP),/Некорректные данные истории группы/);
});

test('rejects foreign group rows instead of allowing them into the active timeline',async()=>{
 const {api}=setup(()=>success([row(id(1),{group_id:OTHER})]));
 await assert.rejects(api.groupMessages('jwt',GROUP),/Некорректные данные истории группы/);
});

test('rejects malformed message IDs, sender IDs, bodies and timestamps',async()=>{
 const invalidRows=[
  row('not-a-uuid'),
  row(id(1),{sender_id:'not-a-user'}),
  row(id(1),{body:42}),
  row(id(1),{created_at:'not-a-timestamp'}),
  row(id(1),{created_at:'2026-99-99T10:00:00Z'}),
  null,
  []
 ];
 for(const invalid of invalidRows){
  const {api}=setup(()=>success([invalid]));
  await assert.rejects(api.groupMessages('jwt',GROUP),/Некорректные данные истории группы/);
 }
});

test('rejects duplicate UUIDs even when their letter casing differs',async()=>{
 const {api}=setup(()=>success([
  row('aaaaaaaa-1111-4111-8111-111111111111'),
  row('AAAAAAAA-1111-4111-8111-111111111111')
 ]));
 await assert.rejects(api.groupMessages('jwt',GROUP),/Некорректные данные истории группы/);
});

test('does not change the group history query or database contract',()=>{
 const source=read('lib/groups.ts');
 assert.match(source,/group_id=eq\.'\+encodeURIComponent\(id\)\+'&order=created_at\.desc,id\.desc&limit=/);
 assert.match(source,/normalizeGroupMessagePage\(latest,id\)\.reverse\(\)/);
 assert.doesNotMatch(source,/service_role|ALTER TABLE|GRANT |DROP TABLE|dangerouslySetInnerHTML/i);
});
