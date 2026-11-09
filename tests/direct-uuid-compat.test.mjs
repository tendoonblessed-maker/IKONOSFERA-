import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createSecureUuid} from '../lib/supabase-rest.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const NATIVE='550e8400-e29b-41d4-a716-446655440000';
const UUID_V4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

test('direct message IDs prefer a valid native randomUUID implementation',()=>{
 let fallbackCalls=0;
 const id=createSecureUuid({
  randomUUID:()=>NATIVE,
  getRandomValues(bytes){fallbackCalls++;bytes.fill(0);return bytes;}
 });
 assert.equal(id,NATIVE);
 assert.equal(fallbackCalls,0);
});

test('older browsers without randomUUID use cryptographically secure UUID v4 bytes',()=>{
 let calls=0;
 const id=createSecureUuid({
  getRandomValues(bytes){calls++;assert.equal(bytes.length,16);bytes.fill(0);return bytes;}
 });
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
  const id=createSecureUuid({
   randomUUID,
   getRandomValues(bytes){fallbackCalls++;bytes.fill(0xff);return bytes;}
  });
  assert.equal(fallbackCalls,1);
  assert.match(id,UUID_V4);
 }
});

test('direct send fails closed when secure randomness is unavailable',()=>{
 assert.throws(()=>createSecureUuid({}),/Безопасная генерация идентификатора недоступна/);
 assert.throws(()=>createSecureUuid({
  getRandomValues(){throw Error('crypto unavailable');}
 }),/Безопасная генерация идентификатора недоступна/);
});

test('AppShell and the PostgREST text-send default share the secure UUID helper',()=>{
 const shell=source('components/AppShell.tsx');
 const api=source('lib/supabase-rest.ts');
 assert.match(shell,/createSecureUuid\(\),reply\?\.id\?\?null/);
 assert.match(api,/clientMessageId: string = createSecureUuid\(\)/);
 assert.doesNotMatch(shell,/crypto\.randomUUID\(\)/);
 assert.doesNotMatch(api,/clientMessageId: string = crypto\.randomUUID\(\)/);
 assert.doesNotMatch(api,/Math\.random/);
});
