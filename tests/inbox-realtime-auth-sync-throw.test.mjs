import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const USER='11111111-1111-4111-8111-111111111111';
const TOKEN='synthetic-user-jwt';
const SOURCE=readFileSync(new URL('../lib/inbox-realtime.ts',import.meta.url),'utf8');
const COMPILED=ts.transpileModule(SOURCE,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;

test('a synchronous Realtime setAuth throw wakes both HTTP-backed inbox views',async()=>{
 const changes=[];
 let subscribeCount=0;
 let removeCount=0;
 let disconnectCount=0;
 let authToken=null;
 const channel={
  on(){return this;},
  subscribe(){subscribeCount++;return this;}
 };
 const client={
  channel(name){assert.equal(name,'inbox-db:'+USER);return channel;},
  realtime:{
   setAuth(token){authToken=token;throw new Error('synthetic synchronous auth failure');},
   disconnect(){disconnectCount++;}
  },
  removeChannel(value){assert.equal(value,channel);removeCount++;return Promise.resolve('ok');}
 };
 const exports={};
 vm.runInNewContext(COMPILED,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  window:{},
  Promise,Error,
  require(specifier){
   if(specifier==='@supabase/supabase-js')return {createClient:()=>client};
   if(specifier==='./supabase-rest')return {apiUrl:'https://unit.test',backendReady:true};
   throw new Error('Unexpected module: '+specifier);
  }
 },{timeout:1000,filename:'lib/inbox-realtime.ts'});

 let unsubscribe;
 assert.doesNotThrow(()=>{
  unsubscribe=exports.subscribeInboxChanges(TOKEN,USER,kind=>changes.push(kind));
 });
 assert.equal(authToken,TOKEN);
 assert.equal(subscribeCount,0,'a channel must not attach after failed auth handoff');
 assert.deepEqual(changes,['direct','group'],'both inboxes reconcile through their existing HTTP/RLS paths');

 unsubscribe();
 await Promise.resolve();
 await Promise.resolve();
 assert.equal(removeCount,1);
 assert.equal(disconnectCount,1);
});
