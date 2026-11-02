import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const id=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
function setup(handler=()=>[]){
 const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const calls=[];
 const exports={};
 vm.runInNewContext(compiled,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   const result=handler(url,options,calls.length);
   return {ok:true,json:async()=>result};
  },
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit.test'};
  }
 },{timeout:2000,filename:'social.cjs'});
 return {api:exports,calls};
}
function idsInCall(url){
 const parsed=new URL(url);
 const filter=parsed.searchParams.get('post_id');
 assert.ok(filter?.startsWith('in.(')&&filter.endsWith(')'));
 return filter.slice(4,-1).split(',');
}

test('empty and malformed post IDs do not trigger network requests',async()=>{
 const {api,calls}=setup();
 const bad=['',null,'not-a-uuid',id(1)+',post_id.eq.'+id(2),'x'.repeat(36)];
 assert.deepEqual(Array.from(await api.listPostReactions('jwt',bad)),[]);
 assert.equal(calls.length,0);
});

test('post reactions use canonical UUIDs, dedupe case variants and keep JWT/RLS',async()=>{
 const {api,calls}=setup();
 await api.listPostReactions('signed-user-jwt',[id(1),id(1).toUpperCase(),id(2),'not-valid']);
 assert.equal(calls.length,1);
 assert.deepEqual(idsInCall(calls[0].url),[id(1),id(2)]);
 assert.equal(new URL(calls[0].url).searchParams.get('limit'),'3000');
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.headers.apikey,'public-test-key');
 assert.equal(calls[0].options.cache,'no-store');
});

test('large post lists are split into bounded requests without dropping valid posts',async()=>{
 const all=Array.from({length:205},(_,i)=>id(i+1));
 const {api,calls}=setup(url=>idsInCall(url).map(post_id=>({
  post_id,user_id:id(999),emoji:'👍🏻'
 })));
 const reactions=await api.listPostReactions('jwt',all);
 assert.equal(calls.length,3);
 assert.deepEqual(calls.map(call=>idsInCall(call.url).length),[100,100,5]);
 assert.deepEqual(Array.from(reactions,row=>row.post_id),all);
 assert.ok(calls.every(call=>call.url.length<5000));
});

test('duplicate IDs across batches never cause duplicate reaction fetches',async()=>{
 const all=Array.from({length:125},(_,i)=>id(i+1));
 const {api,calls}=setup(()=>[]);
 await api.listPostReactions('jwt',[...all,...all.slice(0,50),id(100).toUpperCase()]);
 assert.equal(calls.length,2);
 const queried=calls.flatMap(call=>idsInCall(call.url));
 assert.equal(new Set(queried).size,125);
 assert.deepEqual(queried,all);
});
