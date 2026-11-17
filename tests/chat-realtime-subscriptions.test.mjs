import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {shouldRefreshChatAfterRealtimeFailure} from '../lib/chat-realtime-status.ts';

const CHAT='11111111-1111-4111-8111-111111111111';
const TOKEN='synthetic-user-jwt';

function createHarness(kind,setAuth=()=>Promise.resolve()){
 const path=kind==='direct'?'lib/direct-realtime.ts':'lib/group-realtime.ts';
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const registrations=[];
 const authOptions=[];
 let statusCallback=null;
 let subscribeCount=0;
 let removeCount=0;
 let disconnectCount=0;
 let changeCount=0;
 const channel={
  on(event,config,callback){
   registrations.push({event,config,callback});
   return this;
  },
  subscribe(callback){
   subscribeCount++;
   statusCallback=callback;
   return this;
  }
 };
 const client={
  channel(name){
   assert.equal(name,(kind==='direct'?'direct-db:':'group-db:')+CHAT);
   return channel;
  },
  realtime:{
   setAuth(token){
    authOptions.push(token);
    return setAuth(token);
   },
   disconnect(){disconnectCount++;}
  },
  removeChannel(value){
   assert.equal(value,channel);
   removeCount++;
   return Promise.resolve('ok');
  }
 };
 const exports={};
 vm.runInNewContext(compiled,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  window:{},
  Promise,Error,
  require(specifier){
   if(specifier==='@supabase/supabase-js')return {createClient:()=>client};
   if(specifier==='./supabase-rest')return {apiUrl:'https://unit.test',backendReady:true};
   if(specifier==='./chat-realtime-status')return {shouldRefreshChatAfterRealtimeFailure};
   throw new Error('Unexpected module: '+specifier);
  }
 },{timeout:1000,filename:path});
 const subscribe=kind==='direct'?exports.subscribeDirectChatChanges:exports.subscribeGroupChanges;
 const unsubscribe=subscribe(TOKEN,CHAT,()=>{changeCount++;});
 return {
  registrations,authOptions,unsubscribe,
  emit(status){assert.equal(typeof statusCallback,'function');statusCallback(status);},
  get subscribeCount(){return subscribeCount;},
  get removeCount(){return removeCount;},
  get disconnectCount(){return disconnectCount;},
  get changeCount(){return changeCount;}
 };
}
async function flushMicrotasks(){
 for(let i=0;i<5;i++)await Promise.resolve();
}

for(const kind of ['direct','group']){
 test(kind+' subscription reconciles failures and ignores callbacks after cleanup',async()=>{
  const h=createHarness(kind);
  await flushMicrotasks();
  assert.equal(h.subscribeCount,1);
  assert.deepEqual(h.authOptions,[TOKEN]);
  assert.deepEqual(
   h.registrations.map(item=>({event:item.event,table:item.config.table,filter:item.config.filter})),
   kind==='direct'
    ?[
      {event:'postgres_changes',table:'messages',filter:'chat_id=eq.'+CHAT},
      {event:'postgres_changes',table:'messages',filter:'chat_id=eq.'+CHAT}
     ]
    :[
      {event:'postgres_changes',table:'group_messages',filter:'group_id=eq.'+CHAT}
     ]
  );
  h.emit('SUBSCRIBED');
  h.emit('CHANNEL_ERROR');
  h.emit('TIMED_OUT');
  h.emit('CLOSED');
  h.emit('SUBSCRIBING');
  assert.equal(h.changeCount,4);
  h.unsubscribe();
  h.emit('CHANNEL_ERROR');
  h.emit('CLOSED');
  await flushMicrotasks();
  assert.equal(h.changeCount,4);
  assert.equal(h.removeCount,1);
  assert.equal(h.disconnectCount,1);
 });
}

for(const kind of ['direct','group']){
 test(kind+' subscription does not attach after cleanup wins the auth race',async()=>{
  let resolveAuth;
  const pending=new Promise(resolve=>{resolveAuth=resolve;});
  const h=createHarness(kind,()=>pending);
  h.unsubscribe();
  resolveAuth();
  await flushMicrotasks();
  assert.equal(h.subscribeCount,0);
  assert.equal(h.changeCount,0);
  assert.equal(h.removeCount,1);
  assert.equal(h.disconnectCount,1);
 });
}

for(const kind of ['direct','group']){
 test(kind+' subscription wakes authenticated HTTP reconciliation when Realtime auth fails',async()=>{
  const h=createHarness(kind,()=>Promise.reject(new Error('synthetic auth failure')));
  await flushMicrotasks();
  assert.deepEqual(h.authOptions,[TOKEN]);
  assert.equal(h.subscribeCount,0);
  assert.equal(h.changeCount,1);
  h.unsubscribe();
  await flushMicrotasks();
  assert.equal(h.changeCount,1);
  assert.equal(h.removeCount,1);
  assert.equal(h.disconnectCount,1);
 });
}

for(const kind of ['direct','group']){
 test(kind+' subscription suppresses auth-failure wake when cleanup wins the rejection race',async()=>{
  let rejectAuth;
  const pending=new Promise((_,reject)=>{rejectAuth=reject;});
  const h=createHarness(kind,()=>pending);
  h.unsubscribe();
  rejectAuth(new Error('synthetic auth failure'));
  await flushMicrotasks();
  assert.equal(h.subscribeCount,0);
  assert.equal(h.changeCount,0);
  assert.equal(h.removeCount,1);
  assert.equal(h.disconnectCount,1);
 });
}
