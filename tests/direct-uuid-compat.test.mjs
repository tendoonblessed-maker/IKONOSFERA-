import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const NATIVE='550e8400-e29b-41d4-a716-446655440000';
const UUID_V4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function loadApi(cryptoSource={},fetchImpl=async()=>({ok:true})){
 const compiled=ts.transpileModule(source('lib/supabase-rest.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={};
 vm.runInNewContext(compiled,{
  exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon-test'}},globalThis:{crypto:cryptoSource},fetch:fetchImpl
 },{timeout:1500,filename:'supabase-rest.cjs'});
 return exports;
}

test('direct message IDs prefer a valid native randomUUID implementation',()=>{
 let fallbackCalls=0;
 const api=loadApi({
  randomUUID:()=>NATIVE,
  getRandomValues(bytes){fallbackCalls++;bytes.fill(0);return bytes;}
 });
 assert.equal(api.createSecureUuid(),NATIVE);
 assert.equal(fallbackCalls,0);
});

test('older browsers without randomUUID use cryptographically secure UUID v4 bytes',()=>{
 let calls=0;
 const api=loadApi({
  getRandomValues(bytes){calls++;assert.equal(bytes.length,16);bytes.fill(0);return bytes;}
 });
 const id=api.createSecureUuid();
 assert.equal(calls,1);
 assert.equal(id,'00000000-0000-4000-8000-000000000000');
 assert.match(id,UUID_V4);
});

test('throwing or malformed native randomUUID falls back to getRandomValues',()=>{
 for(const randomUUID of [
  ()=>{throw Error('partial implementation');},
  ()=> 'not-a-uuid'
 ]){
  let fallbackCalls=0;
  const api=loadApi({
   randomUUID,
   getRandomValues(bytes){fallbackCalls++;bytes.fill(0xff);return bytes;}
  });
  const id=api.createSecureUuid();
  assert.equal(fallbackCalls,1);
  assert.match(id,UUID_V4);
 }
});

test('direct send fails closed when secure randomness is unavailable',()=>{
 const api=loadApi({});
 assert.throws(()=>api.createSecureUuid({}),/Безопасная генерация идентификатора недоступна/);
 assert.throws(()=>api.createSecureUuid({
  getRandomValues(){throw Error('crypto unavailable');}
 }),/Безопасная генерация идентификатора недоступна/);
});


test('private direct media uploads use secure UUID fallback in their Storage path',async()=>{
 const calls=[];
 const api=loadApi({
  getRandomValues(bytes){bytes.set(Array.from({length:16},(_,i)=>i));return bytes;}
 },async(url,options)=>{calls.push({url,options});return {ok:true,status:200};});
 const result=await api.uploadDirectMedia(
  'user-token','33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  {type:'image/png',size:12}
 );
 const expected='33333333-3333-4333-8333-333333333333/11111111-1111-4111-8111-111111111111/00010203-0405-4607-8809-0a0b0c0d0e0f.png';
 assert.equal(result.path,expected);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://test.supabase.invalid/storage/v1/object/ikonosfera-direct-media/'+expected);
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-token');
});

test('AppShell and the PostgREST text-send default share the secure UUID helper',()=>{
 const shell=source('components/AppShell.tsx');
 const api=source('lib/supabase-rest.ts');
 assert.match(shell,/createSecureUuid\(\),reply\?\.id\?\?null/);
 assert.match(api,/clientMessageId: string = createSecureUuid\(\)/);
 assert.doesNotMatch(shell,/crypto\.randomUUID\(\)/);
 assert.doesNotMatch(api,/clientMessageId: string = crypto\.randomUUID\(\)/);
 assert.doesNotMatch(api,/Math\.random\s*\(/);
});
