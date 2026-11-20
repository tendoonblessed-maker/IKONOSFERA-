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

function createHarness(setAuth=()=>Promise.resolve()){
 const registrations=[];
 const authOptions=[];
 const changes=[];
 let statusCallback=null;
 let subscribeCount=0;
 let removeCount=0;
 let disconnectCount=0;
 let clientOptions=null;
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
   assert.equal(name,'inbox-db:'+USER);
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
 vm.runInNewContext(COMPILED,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  window:{},
  Promise,Error,
  require(specifier){
   if(specifier==='@supabase/supabase-js')return {createClient(_url,_key,options){clientOptions=options;return client;}};
   if(specifier==='./supabase-rest')return {apiUrl:'https://unit.test',backendReady:true};
   throw new Error('Unexpected module: '+specifier);
  }
 },{timeout:1000,filename:'lib/inbox-realtime.ts'});
 const unsubscribe=exports.subscribeInboxChanges(TOKEN,USER,kind=>changes.push(kind));
 return {
  registrations,authOptions,changes,clientOptions,unsubscribe,
  shouldRefresh:exports.shouldRefreshInboxAfterRealtimeFailure,
  emit(status){
   assert.equal(typeof statusCallback,'function');
   statusCallback(status);
  },
  get subscribeCount(){return subscribeCount;},
  get removeCount(){return removeCount;},
  get disconnectCount(){return disconnectCount;}
 };
}

async function flushMicrotasks(){
 for(let i=0;i<6;i++)await Promise.resolve();
}

test('only transport failures request an inbox reconciliation',()=>{
 const h=createHarness();
 for(const status of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])assert.equal(h.shouldRefresh(status),true,status);
 for(const status of ['SUBSCRIBED','SUBSCRIBING','JOINING','unknown'])assert.equal(h.shouldRefresh(status),false,status);
 h.unsubscribe();
});

test('global inbox subscribes with the current JWT and exact RLS-filtered table events',async()=>{
 const h=createHarness();
 await flushMicrotasks();
 assert.deepEqual(h.authOptions,[TOKEN]);
 assert.equal(h.clientOptions.auth.persistSession,false);
 assert.equal(h.clientOptions.auth.autoRefreshToken,false);
 assert.equal(h.clientOptions.auth.detectSessionInUrl,false);
 assert.equal(h.subscribeCount,1);
 assert.deepEqual(
  h.registrations.map(item=>({event:item.event,schema:item.config.schema,table:item.config.table})),
  [
   {event:'postgres_changes',schema:'public',table:'messages'},
   {event:'postgres_changes',schema:'public',table:'messages'},
   {event:'postgres_changes',schema:'public',table:'group_messages'},
   {event:'postgres_changes',schema:'public',table:'group_messages'}
  ]
 );
 assert.deepEqual(h.registrations.map(item=>item.config.event),['INSERT','UPDATE','INSERT','UPDATE']);
 h.unsubscribe();
 await flushMicrotasks();
 assert.equal(h.removeCount,1);
 assert.equal(h.disconnectCount,1);
});

test('group message edits wake only the group inbox preview refresh',async()=>{
 const h=createHarness();
 await flushMicrotasks();
 const updates=h.registrations.filter(item=>item.config.table==='group_messages'&&item.config.event==='UPDATE');
 assert.equal(updates.length,1);
 updates[0].callback();
 assert.deepEqual(h.changes,['group']);
 h.unsubscribe();
});

test('SUBSCRIBED and every Realtime failure wake both inbox views; unrelated statuses are ignored',async()=>{
 const h=createHarness();
 await flushMicrotasks();
 h.emit('SUBSCRIBED');
 h.emit('CHANNEL_ERROR');
 h.emit('TIMED_OUT');
 h.emit('CLOSED');
 h.emit('SUBSCRIBING');
 assert.deepEqual(h.changes,[
  'direct','group',
  'direct','group',
  'direct','group',
  'direct','group'
 ]);
 h.unsubscribe();
 h.emit('CHANNEL_ERROR');
 h.emit('CLOSED');
 assert.equal(h.changes.length,8,'cleanup suppresses late status callbacks');
});

test('a rejected Realtime setAuth immediately wakes both HTTP-backed inbox views',async()=>{
 const h=createHarness(()=>Promise.reject(new Error('synthetic auth failure')));
 await flushMicrotasks();
 assert.deepEqual(h.authOptions,[TOKEN]);
 assert.equal(h.subscribeCount,0,'no channel is subscribed without successful JWT handoff');
 assert.deepEqual(h.changes,['direct','group']);
 h.unsubscribe();
 await flushMicrotasks();
 assert.equal(h.changes.length,2);
 assert.equal(h.removeCount,1);
 assert.equal(h.disconnectCount,1);
});

test('cleanup wins over a pending setAuth rejection without waking a stale account inbox',async()=>{
 let rejectAuth;
 const pending=new Promise((_,reject)=>{rejectAuth=reject;});
 const h=createHarness(()=>pending);
 h.unsubscribe();
 rejectAuth(new Error('synthetic late auth failure'));
 await flushMicrotasks();
 assert.equal(h.subscribeCount,0);
 assert.deepEqual(h.changes,[]);
 assert.equal(h.removeCount,1);
 assert.equal(h.disconnectCount,1);
});

test('cleanup before setAuth resolves never attaches the inbox channel',async()=>{
 let resolveAuth;
 const pending=new Promise(resolve=>{resolveAuth=resolve;});
 const h=createHarness(()=>pending);
 h.unsubscribe();
 resolveAuth();
 await flushMicrotasks();
 assert.equal(h.subscribeCount,0);
 assert.deepEqual(h.changes,[]);
 assert.equal(h.removeCount,1);
 assert.equal(h.disconnectCount,1);
});
