import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const CHAT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const uuid=n=>'12345678-1234-1234-1234-'+n.toString(16).padStart(12,'0');

function setup(responder=()=>[]){
 const calls=[],exports={};
 vm.runInNewContext(compiled,{
  exports,AbortSignal,
  process:{env:{
   NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'
  }},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return {ok:true,status:200,text:async()=>JSON.stringify(responder(url))};
  }
 },{filename:'supabase-rest.cjs',timeout:3000});
 return {api:exports,calls};
}

test('malformed reply references do not prevent valid reply previews',async()=>{
 const {api,calls}=setup(()=>[{id:uuid(1),body:'Original'}]);
 const results=await api.listReplyTargets('user-jwt',CHAT,[
  '-'.repeat(36),'12345678-1234-1234-1234-12345678901g',
  uuid(1).toUpperCase(),uuid(1),'x'.repeat(36)
 ]);
 assert.equal(calls.length,1);
 const url=new URL(calls[0].url);
 assert.equal(url.pathname,'/rest/v1/messages');
 assert.equal(url.searchParams.get('chat_id'),'eq.'+CHAT);
 assert.equal(url.searchParams.get('id'),'in.('+uuid(1)+')');
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-jwt');
 assert.deepEqual(Array.from(results,r=>r.body),['Original']);
});

test('invalid-only reply IDs never send a database query',async()=>{
 const {api,calls}=setup();
 const result=await api.listReplyTargets('jwt',CHAT,[
  '-'.repeat(36),'a'.repeat(36),null,undefined,'not-an-id'
 ]);
 assert.equal(result.length,0);
 assert.equal(calls.length,0);
});

test('reply target query is bounded to 100 distinct valid IDs',async()=>{
 const {api,calls}=setup();
 const ids=Array.from({length:125},(_,n)=>uuid(n));
 await api.listReplyTargets('jwt',CHAT,[
  ...Array.from({length:125},()=>'-'.repeat(36)),
  ids[0].toUpperCase(),...ids
 ]);
 assert.equal(calls.length,1);
 const filter=new URL(calls[0].url).searchParams.get('id');
 const queried=filter.slice(4,-1).split(',');
 assert.equal(queried.length,100);
 assert.equal(new Set(queried).size,100);
 assert.equal(queried[0],ids[0]);
 assert.equal(queried[99],ids[99]);
});

test('valid reply target query still surfaces network failures',async()=>{
 const {api}=setup(()=>{throw Error('network offline');});
 // A failed request must not be mistaken for missing reply targets.
 await assert.rejects(api.listReplyTargets('jwt',CHAT,[uuid(1)]),/network offline/);
});
