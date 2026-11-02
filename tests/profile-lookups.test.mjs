import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const uuid=n=>'abcdefab-cdef-4abc-8def-'+n.toString(16).padStart(12,'0');

function setup(responder=()=>[]){
 const calls=[];
 const exports={};
 vm.runInNewContext(compiled,{
  exports,AbortSignal,
  process:{env:{
   NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'
  }},
  fetch:async(url,options)=>{
   calls.push({url,options});
   const result=responder(url,options);
   return {ok:true,status:200,text:async()=>JSON.stringify(result)};
  }
 },{filename:'supabase-rest.cjs',timeout:3000});
 return {api:exports,calls};
}

test('one malformed contact ID cannot hide valid profile names',async()=>{
 const {api,calls}=setup(()=>[{id:uuid(1),username:'friend'}]);
 const result=await api.listProfiles('user-jwt',[
  'x'.repeat(36),'12345678-1234-1234-1234-12345678901g',
  uuid(1).toUpperCase(),uuid(1),'123456781234-1234-1234-123456789012'
 ]);
 assert.equal(calls.length,1);
 const url=new URL(calls[0].url);
 assert.equal(url.pathname,'/rest/v1/profiles');
 assert.equal(url.searchParams.get('id'),'in.('+uuid(1)+')');
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-jwt');
 assert.equal(calls[0].options.cache,'no-store');
 assert.deepEqual(Array.from(result,x=>x.username),['friend']);
});

test('empty and malformed-only profile lists never request Supabase',async()=>{
 const {api,calls}=setup();
 assert.equal((await api.listProfiles('jwt',[])).length,0);
 assert.equal((await api.listProfiles('jwt',['not-a-uuid','-'.repeat(36)])).length,0);
 assert.equal(calls.length,0);
});

test('large profile lookups are deduplicated and split into bounded requests',async()=>{
 const {api,calls}=setup(url=>{
  const filter=new URL(url).searchParams.get('id');
  return filter.slice(4,-1).split(',').map(id=>({id,username:'member'}));
 });
 const ids=Array.from({length:205},(_,i)=>uuid(i));
 const result=await api.listProfiles('jwt',[ids[0].toUpperCase(),...ids,ids[0]]);
 assert.equal(calls.length,3);
 const batches=calls.map(call=>new URL(call.url).searchParams.get('id').slice(4,-1).split(','));
 assert.deepEqual(batches.map(batch=>batch.length),[100,100,5]);
 const queried=batches.flat();
 assert.equal(new Set(queried).size,205);
 assert.deepEqual(queried,ids);
 assert.equal(result.length,205);
 assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer jwt'));
});

test('a failed profile batch remains an error instead of silently hiding contacts',async()=>{
 const {api}=setup(()=>{throw Error('network offline');});
 await assert.rejects(api.listProfiles('jwt',[uuid(1)]),/network offline/);
});
