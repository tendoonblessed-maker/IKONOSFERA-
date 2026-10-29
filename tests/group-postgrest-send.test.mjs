import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const UUID='11111111-1111-4111-8111-111111111111';
const GROUP='22222222-2222-4222-8222-222222222222';
const OWNER='33333333-3333-4333-8333-333333333333';
const ROW={id:UUID,group_id:GROUP,sender_id:OWNER,body:'Привет',created_at:'2026-10-29T08:00:00Z'};
const success=data=>({ok:true,json:async()=>data});
const response=(message)=>({ok:false,json:async()=>({message})});

function setup(fetchHandler){
 const src=readFileSync(new URL('../lib/groups.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(src,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={};
 const calls=[];
 const ctx={
  exports,
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit-test.invalid'};
  },
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-anon-test'}},
  AbortSignal,
  fetch:async(url,options)=>{
   calls.push({url,options});
   return fetchHandler(url,options,calls.length);
  }
 };
 vm.runInNewContext(compiled,ctx,{timeout:2000,filename:'groups.cjs'});
 return {api:exports,calls};
}

test('fresh group send generates no second GET and uses INSERT DO NOTHING',async()=>{
 const {api,calls}=setup(()=>success([ROW]));
 const result=await api.sendGroupMessage('test-jwt',GROUP,OWNER,'Привет',UUID);
 assert.equal(result.id,UUID);
 assert.equal(calls.length,1);
 const {url,options}=calls[0];
 assert.equal(url,'https://unit-test.invalid/rest/v1/group_messages?on_conflict=id');
 assert.equal(options.method,'POST');
 assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=representation');
 assert.equal(options.headers.Authorization,'Bearer test-jwt');
 assert.equal(options.headers.apikey,'public-anon-test');
 assert.deepEqual(JSON.parse(options.body),{id:UUID,group_id:GROUP,sender_id:OWNER,body:'Привет'});
 assert.ok(options.signal instanceof AbortSignal);
});

test('duplicate POST response [] resolves canonical row via scoped RLS SELECT',async()=>{
 const {api,calls}=setup((url,options)=>options.method==='POST'?success([]):success([ROW]));
 const result=await api.sendGroupMessage('test-jwt',GROUP,OWNER,'Привет',UUID);
 assert.equal(result.id,UUID);
 assert.equal(calls.length,2);
 const get=calls[1];
 assert.equal(get.options.method,'GET');
 assert.ok(get.url.includes('id=eq.'+UUID));
 assert.ok(get.url.includes('group_id=eq.'+GROUP));
 assert.ok(get.url.includes('sender_id=eq.'+OWNER));
 assert.equal(get.options.headers.Authorization,'Bearer test-jwt');
});

test('a committed POST with lost response is recovered without inserting twice',async()=>{
 const {api,calls}=setup((url,options)=>{
  if(options.method==='POST')throw Error('network response lost');
  return success([ROW]);
 });
 const result=await api.sendGroupMessage('test-jwt',GROUP,OWNER,'Привет',UUID);
 assert.equal(result.id,UUID);
 assert.equal(calls.length,2);
 assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});

test('an uncertain outcome preserves manual retry and never automatically POSTs twice',async()=>{
 const {api,calls}=setup((url,options)=>options.method==='POST'?Promise.reject(Error('timeout')):response('temporarily unavailable'));
 await assert.rejects(api.sendGroupMessage('test-jwt',GROUP,OWNER,'Привет',UUID),/Не удалось подтвердить отправку/);
 assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});

test('a mismatched canonical response is never accepted as this group message',async()=>{
 const wrong={...ROW,body:'Совсем другой текст'};
 const {api}=setup(()=>success([wrong]));
 await assert.rejects(api.sendGroupMessage('test-jwt',GROUP,OWNER,'Привет',UUID),/Не удалось подтвердить отправку именно этого сообщения/);
});

test('reject missing/incorrect sender IDs and empty bodies before any POST',async()=>{
 const {api,calls}=setup(()=>success([ROW]));
 await assert.rejects(api.sendGroupMessage('test-jwt',GROUP,OWNER,' ',UUID),/Неверные параметры/);
 await assert.rejects(api.sendGroupMessage('test-jwt',GROUP,OWNER,'Привет','invalid-id'),/Неверные параметры/);
 assert.equal(calls.length,0);
});
