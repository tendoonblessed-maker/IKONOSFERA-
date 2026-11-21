import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {fetchJsonWithTimeout} from '../lib/fetch-timeout.mjs';

const CHANNEL='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

function setup(handler=async()=>({ok:true,status:200,json:async()=>[]})){
 const calls=[];
 const exports={};
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://unit.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-anon'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  },
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit.test'};
   if(name==='./fetch-timeout.mjs')return {fetchJsonWithTimeout};
   throw new Error('Unexpected import: '+name);
  }
 };
 // Deliberately omit AbortSignal: the social API must not depend on the
 // static timeout API missing in older Safari and embedded Android WebViews.
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'social.cjs'});
 return {api:exports,calls};
}

test('channel discovery reads use the portable 18-second deadline and preserve the user JWT',async()=>{
 const {api,calls}=setup();
 const channels=await api.listChannels('signed-user-jwt');
 assert.deepEqual(channels,[]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.headers.apikey,'public-anon');
 assert.equal(calls[0].options.cache,'no-store');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
 assert.match(source,/SOCIAL_READ_TIMEOUT_MS=18000/);
 assert.match(source,/fetchWithTimeout\(fetch,apiUrl\+path,init,SOCIAL_READ_TIMEOUT_MS/);
 assert.doesNotMatch(source,/AbortSignal\.timeout/);
});

test('channel discussion history uses the same bounded RLS-backed GET path',async()=>{
 const {api,calls}=setup();
 const rows=await api.listDiscussionMessages('signed-user-jwt',CHANNEL);
 assert.deepEqual(rows,[]);
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/channel_discussion_messages/);
 assert.match(calls[0].url,/channel_id=eq\./);
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('social writes deliberately retain their original no-automatic-timeout semantics',async()=>{
 const {api,calls}=setup();
 await api.sendDiscussionMessage('signed-user-jwt',CHANNEL,USER,'Привет');
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.signal,undefined);
 assert.equal(calls[0].options.body,JSON.stringify({
  channel_id:CHANNEL,author_id:USER,body:'Привет'
 }));
});

test('failed social reads surface a bounded-request error without retrying',async()=>{
 const networkError=new TypeError('offline');
 const {api,calls}=setup(async()=>{throw networkError;});
 await assert.rejects(api.listChannels('signed-user-jwt'),error=>error===networkError);
 assert.equal(calls.length,1);
});
