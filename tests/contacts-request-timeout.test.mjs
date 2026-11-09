import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
 buildPostgrestCursorFilter,
 collectPostgrestKeysetPages
} from '../lib/postgrest-pagination.mjs';

const OWNER='11111111-1111-4111-8111-111111111111';
const CONTACT='22222222-2222-4222-8222-222222222222';
const STAMP='2026-11-09T12:00:00.000000Z';
const source=readFileSync(new URL('../lib/contacts.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

function setup(fetcher){
 const timers=new Map();
 const cleared=[];
 const calls=[];
 let nextTimer=1;
 const exports={};
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-anon'}},
  URLSearchParams,
  AbortController,
  setTimeout(callback,delay){
   const id=nextTimer++;
   timers.set(id,{callback,delay});
   return id;
  },
  clearTimeout(id){
   cleared.push(id);
   timers.delete(id);
  },
  fetch:async(url,options)=>{
   calls.push({url,options});
   return fetcher(url,options,calls.length);
  },
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit.test'};
   if(name==='@/lib/postgrest-pagination.mjs')return {
    buildPostgrestCursorFilter,collectPostgrestKeysetPages
   };
   throw new Error('Unexpected module: '+name);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2500,filename:'contacts.cjs'});
 return {api:exports,timers,cleared,calls};
}

function timeoutResponse(_url,options){
 return new Promise((resolve,reject)=>{
  options.signal.addEventListener('abort',()=>{
   const error=new Error('request aborted');
   error.name='AbortError';
   reject(error);
  },{once:true});
 });
}

test('contact pagination uses a bounded request and clears its timer after success',async()=>{
 const {api,timers,cleared,calls}=setup(async()=>({
  ok:true,status:200,
  headers:{get:name=>name==='content-range'?'0-0/1':null},
  json:async()=>[{contact_id:CONTACT,created_at:STAMP}]
 }));
 const result=await api.listSavedContacts('signed-user-jwt',OWNER);
 assert.deepEqual(result,[CONTACT]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.headers.Prefer,'count=exact');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
 assert.equal(calls[0].options.signal.aborted,false);
 assert.equal(timers.size,0);
 assert.deepEqual(cleared,[1]);
 assert.match(source,/CONTACT_REQUEST_TIMEOUT_MS=18000/);
 assert.match(source,/fetchContactsWithTimeout\(apiUrl\+"\/rest\/v1\/"\+table/);
 assert.doesNotMatch(source,/AbortSignal\.timeout/);
});

test('a stalled contact page aborts after 18 seconds and returns a readable error',async()=>{
 const {api,timers,cleared,calls}=setup(timeoutResponse);
 const pending=api.listSavedContacts('signed-user-jwt',OWNER);
 assert.equal(calls.length,1);
 assert.equal(timers.size,1);
 const [timerId,timer]=[...timers.entries()][0];
 assert.equal(timer.delay,18000);
 timer.callback();
 await assert.rejects(pending,/Запрос контактов не завершился вовремя/);
 assert.equal(calls.length,1,'a timed-out read must not be retried automatically');
 assert.equal(calls[0].options.signal.aborted,true);
 assert.deepEqual(cleared,[timerId]);
});

test('add-contact mutations are also bounded and never retried after an uncertain timeout',async()=>{
 const {api,timers,cleared,calls}=setup(timeoutResponse);
 const pending=api.addSavedContact('signed-user-jwt',OWNER,CONTACT);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
 const [timerId,timer]=[...timers.entries()][0];
 assert.equal(timer.delay,18000);
 timer.callback();
 await assert.rejects(pending,/Запрос контактов не завершился вовремя/);
 assert.equal(calls.length,1);
 assert.deepEqual(cleared,[timerId]);
});

test('ordinary network errors remain distinguishable from request timeouts',async()=>{
 const networkError=new TypeError('network unavailable');
 const {api,timers,cleared}=setup(async()=>{throw networkError;});
 await assert.rejects(api.listBlockedUsers('signed-user-jwt',OWNER),error=>error===networkError);
 assert.equal(timers.size,0);
 assert.deepEqual(cleared,[1]);
});

test('contact and blocklist writes use the same bounded request path',async()=>{
 const {api,calls,timers,cleared}=setup(async()=>({ok:true,status:201}));
 await api.addSavedContact('signed-user-jwt',OWNER,CONTACT);
 await api.addBlockedUser('signed-user-jwt',OWNER,CONTACT);
 assert.equal(calls.length,2);
 assert.ok(calls.every(call=>call.options.signal instanceof AbortSignal));
 assert.ok(calls.every(call=>call.options.signal.aborted===false));
 assert.equal(timers.size,0);
 assert.deepEqual(cleared,[1,2]);
});
