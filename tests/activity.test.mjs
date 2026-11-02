import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const upper='AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';

function setup(rows=[]){
 const source=readFileSync(new URL('../lib/activity.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const calls=[];
 const exports={};
 const context={
  exports,process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return {ok:true,json:async()=>rows};
  },
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit.test'};
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'activity.cjs'});
 return {api:exports,calls};
}

test('one malformed 36-character contact ID cannot break the entire activity batch',async()=>{
 const {api,calls}=setup([{user_id:OWNER,status:'в сети',last_seen_at:null}]);
 const invalid=[
  '-'.repeat(36),
  'x'.repeat(36),
  '1'.repeat(36),
  '111111111111-1111-1111-1111-11111111',
  '11111111-1111-1111-1111-11111111111g',
  'not-a-uuid'
 ];
 const result=await api.getUserActivities('jwt',[...invalid,OWNER,upper,OWNER]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://unit.test/rest/v1/rpc/get_user_activity');
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
 assert.equal(calls[0].options.cache,'no-store');
 assert.deepEqual(JSON.parse(calls[0].options.body),{p_user_ids:[OWNER,upper]});
 assert.equal(result[OWNER].status,'в сети');
});

test('no valid UUID means no activity request',async()=>{
 const {api,calls}=setup();
 const result=await api.getUserActivities('jwt',['-'.repeat(36),'', 'not-a-uuid']);
 assert.deepEqual(Object.keys(result),[]);
 assert.equal(calls.length,0);
});

test('activity batches remain deduplicated and limited to 100 valid IDs',async()=>{
 const {api,calls}=setup();
 const ids=Array.from({length:120},(_,n)=>
  '00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0')
 );
 await api.getUserActivities('jwt',[OTHER,...ids,...ids]);
 const sent=JSON.parse(calls[0].options.body).p_user_ids;
 assert.equal(sent.length,100);
 assert.equal(sent[0],OTHER);
 assert.equal(sent[1],ids[0]);
 assert.equal(sent[99],ids[98]);
 assert.equal(new Set(sent).size,100);
});


test('invalid account UUID never triggers activity visibility lookup',async()=>{
 const {api,calls}=setup([{visibility:'exact'}]);
 for(const bad of ['', '-'.repeat(36), '11111111-1111-1111-1111-11111111111g']){
  assert.equal(await api.myActivityVisibility('jwt',bad),'approximate');
 }
 assert.equal(calls.length,0,'malformed UUIDs must not reach PostgREST');
});

test('valid account UUID retains exact and approximate visibility behavior',async()=>{
 const exact=setup([{visibility:'exact'}]);
 assert.equal(await exact.api.myActivityVisibility('jwt',OWNER),'exact');
 assert.equal(exact.calls.length,1);
 assert.equal(exact.calls[0].url,
  'https://unit.test/rest/v1/user_activity?select=visibility&user_id=eq.'+OWNER+'&limit=1');
 assert.equal(exact.calls[0].options.method,'GET');
 const fallback=setup([]);
 assert.equal(await fallback.api.myActivityVisibility('jwt',upper),'approximate');
 assert.equal(fallback.calls.length,1);
});
