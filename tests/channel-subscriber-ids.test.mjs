import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const id=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
function setup(response=[{channel_id:id(1),subscribers:7}]){
 const calls=[];
 const exports={};
 const context={
  exports,process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return {ok:true,json:async()=>response};
  },
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit.test'};
  }
 };
 vm.runInNewContext(compiled,context,{filename:'social.cjs',timeout:2000});
 return {api:exports,calls};
}

test('malformed channel IDs are excluded without breaking valid subscriber counts',async()=>{
 const {api,calls}=setup();
 const valid=id(1);
 const invalid=['------------------------------------','12345678-1234-1234-1234-12345678901z','not-a-uuid'];
 const counts=await api.getChannelSubscriberCounts('signed-jwt',[...invalid,valid]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://unit.test/rest/v1/rpc/channel_subscriber_counts');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-jwt');
 assert.equal(calls[0].options.cache,'no-store');
 assert.deepEqual(JSON.parse(calls[0].options.body),{p_ids:[valid]});
 assert.equal(counts[valid],7);
});

test('no network request is made when all subscriber IDs are malformed',async()=>{
 const {api,calls}=setup();
 const counts=await api.getChannelSubscriberCounts('jwt',['------------------------------------','x','']);
 assert.equal(calls.length,0);
 assert.equal(Object.keys(counts).length,0);
});

test('case variants deduplicate and the subscriber request stays capped at 100 IDs',async()=>{
 const {api,calls}=setup();
 const ids=Array.from({length:105},(_,i)=>id(i+10));
 assert.notEqual(ids[0].toUpperCase(),ids[0]);
 await api.getChannelSubscriberCounts('jwt',[ids[0].toUpperCase(),...ids,'------------------------------------']);
 assert.equal(calls.length,1);
 const sent=JSON.parse(calls[0].options.body).p_ids;
 assert.equal(sent.length,100);
 assert.equal(sent[0],ids[0]);
 assert.equal(new Set(sent).size,100);
 assert.equal(sent.at(-1),ids[99]);
});


test('selected channel lookup rejects malformed UUIDs without sending HTTP requests',async()=>{
 const {api,calls}=setup();
 for(const bad of ['------------------------------------','12345678-1234-1234-1234-12345678901z','not-a-uuid','']){
  assert.equal(await api.getChannelById('jwt',bad),null);
 }
 assert.equal(calls.length,0);
});

test('selected channel lookup preserves valid UUID requests and response',async()=>{
 const valid=id(2);
 const channel={id:valid,title:'Тестовый канал'};
 const {api,calls}=setup([channel]);
 const result=await api.getChannelById('jwt',valid);
 assert.equal(result.id,valid);
 assert.equal(result.title,'Тестовый канал');
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://unit.test/rest/v1/channels?select=*&id=eq.'+valid+'&limit=1');
 assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
 assert.equal(calls[0].options.cache,'no-store');
});
