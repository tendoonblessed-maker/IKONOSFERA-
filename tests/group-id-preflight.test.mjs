import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const GROUP='11111111-1111-4111-8111-111111111111';
const ROW={id:'22222222-2222-4222-8222-222222222222',group_id:GROUP,sender_id:'33333333-3333-4333-8333-333333333333',body:'Тест',created_at:'2026-11-02T12:00:00Z'};

function setup(handler=()=>({ok:true,json:async()=>[]})){
 const source=readFileSync(new URL('../lib/groups.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const calls=[];
 const exports={};
 vm.runInNewContext(compiled,{
  exports,AbortSignal,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit.test'};
  },
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options);
  }
 },{timeout:2000,filename:'groups.cjs'});
 return {api:exports,calls};
}

test('invalid group IDs never reach member, history or read-receipt endpoints',async()=>{
 const {api,calls}=setup();
 for(const bad of ['', 'not-a-uuid', GROUP+',or(id.eq.'+GROUP+')', GROUP+'%20', '../'+GROUP]){
  await assert.rejects(api.groupMembers('jwt',bad),/Некорректный идентификатор группы/);
  await assert.rejects(api.groupMessages('jwt',bad),/Некорректный идентификатор группы/);
  await assert.rejects(api.markGroupRead('jwt',bad),/Некорректный идентификатор группы/);
 }
 assert.equal(calls.length,0,'malformed IDs must not trigger any fetch');
});

test('valid group member and message reads retain JWT, group scoping and chronological UI order',async()=>{
 const earlier={...ROW,id:'44444444-4444-4444-8444-444444444444',created_at:'2026-11-02T11:59:00Z'};
 const {api,calls}=setup((url)=>({
  ok:true,json:async()=>url.includes('group_members')
   ?[{group_id:GROUP,user_id:ROW.sender_id}]:[ROW,earlier]
 }));
 const members=await api.groupMembers('jwt',GROUP);
 const messages=await api.groupMessages('jwt',GROUP);
 assert.equal(members.length,1);
 assert.deepEqual(Array.from(messages,x=>x.id),[earlier.id,ROW.id]);
 assert.equal(calls.length,2);
 for(const call of calls){
  assert.equal(call.options.method,'GET');
  assert.equal(call.options.headers.Authorization,'Bearer jwt');
  assert.equal(call.options.headers.apikey,'public-test');
  assert.ok(call.url.includes('group_id=eq.'+GROUP));
  assert.ok(call.options.signal instanceof AbortSignal);
 }
 assert.match(calls[1].url,/order=created_at.desc,id.desc&limit=150/);
});

test('valid read acknowledgement still invokes the existing authenticated RPC',async()=>{
 const {api,calls}=setup();
 await api.markGroupRead('jwt',GROUP);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://unit.test/rest/v1/rpc/mark_group_read');
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
 assert.deepEqual(JSON.parse(calls[0].options.body),{p_group_id:GROUP});
});
