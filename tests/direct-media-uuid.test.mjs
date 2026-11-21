import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {createSecureUuid} from '../lib/secure-uuid.mjs';

const CHAT='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const FILE={type:'image/png',size:8};
const SOURCE=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');

function setup(cryptoSource,fetchResponse={ok:true}){
 const compiled=ts.transpileModule(SOURCE,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={};
 const calls=[];
 const context={
  exports,
  require(name){
   assert.equal(name,'./secure-uuid.mjs');
   return {createSecureUuid:()=>createSecureUuid(cryptoSource)};
  },
  process:{env:{
   NEXT_PUBLIC_SUPABASE_URL:'https://supabase.test',
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon'
  }},
  fetch:async(url,options)=>{calls.push({url,options});return fetchResponse;}
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'supabase-rest.cjs'});
 return {api:exports,calls};
}

test('direct media upload uses secure getRandomValues fallback when randomUUID is missing',async()=>{
 const source={getRandomValues(bytes){bytes.set(Array.from({length:16},(_,i)=>i));return bytes;}};
 const {api,calls}=setup(source);
 const result=await api.uploadDirectMedia('test-jwt',CHAT,OWNER,FILE);
 assert.equal(result.path,CHAT+'/'+OWNER+'/00010203-0405-4607-8809-0a0b0c0d0e0f.png');
 assert.equal(result.type,'image');
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer test-jwt');
 assert.equal(calls[0].options.headers['x-upsert'],'false');
});

test('direct media upload prefers a valid native UUID and never calls fallback',async()=>{
 const native='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let fallbackCalls=0;
 const {api,calls}=setup({randomUUID:()=>native,getRandomValues(){fallbackCalls++;throw Error('must not run');}});
 const result=await api.uploadDirectMedia('test-jwt',CHAT,OWNER,FILE);
 assert.equal(result.path,CHAT+'/'+OWNER+'/'+native+'.png');
 assert.equal(fallbackCalls,0);
 assert.equal(calls.length,1);
});

test('direct media upload falls back when native randomUUID throws',async()=>{
 const source={randomUUID(){throw Error('native unavailable');},getRandomValues(bytes){bytes.fill(7);return bytes;}};
 const {api,calls}=setup(source);
 const result=await api.uploadDirectMedia('test-jwt',CHAT,OWNER,FILE);
 assert.match(result.path,/\/07070707-0707-4707-8707-070707070707\.png$/);
 assert.equal(calls.length,1);
});

test('direct media upload fails closed without secure randomness and sends no request',async()=>{
 const {api,calls}=setup({});
 await assert.rejects(api.uploadDirectMedia('test-jwt',CHAT,OWNER,FILE),/Безопасная генерация идентификатора недоступна/);
 assert.equal(calls.length,0);
});

test('direct media upload fails closed when getRandomValues throws',async()=>{
 const {api,calls}=setup({getRandomValues(){throw Error('secure source failed');}});
 await assert.rejects(api.uploadDirectMedia('test-jwt',CHAT,OWNER,FILE),/Безопасная генерация идентификатора недоступна/);
 assert.equal(calls.length,0);
});
