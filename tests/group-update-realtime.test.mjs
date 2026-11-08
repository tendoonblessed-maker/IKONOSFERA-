import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const GROUP='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function setup(path){
 const handlers=[];
 let disconnected=0;
 let removed=0;
 const channel={
  on(type,filter,callback){
   assert.equal(type,'postgres_changes');
   handlers.push({filter,callback});
   return this;
  },
  subscribe(callback){callback('SUBSCRIBED');return this;}
 };
 const client={
  channel(){return channel;},
  realtime:{setAuth:async()=>{},disconnect(){disconnected++;}},
  removeChannel:async()=>{removed++;}
 };
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={};
 const context={
  exports,window:{},process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-key'}},
  setTimeout,clearTimeout,
  require(name){
   if(name==='@supabase/supabase-js')return {createClient:()=>client};
   if(name==='./supabase-rest')return {apiUrl:'https://unit.test',backendReady:true};
   if(name==='./realtime-wakeup')return {createRealtimeWakeup:(callback,delay=75)=>{
    let timer=null,disposed=false;
    const pending=new Set();
    return {
     notify(kind){if(disposed)return;pending.add(kind);if(timer!==null)return;timer=setTimeout(()=>{
      timer=null;const values=[...pending];pending.clear();if(!disposed)for(const value of values)callback(value);
     },delay);},
     dispose(){disposed=true;if(timer!==null)clearTimeout(timer);timer=null;pending.clear();}
    };
   }};
   throw new Error('Unexpected module: '+name);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:path});
 return {api:exports,handlers,stats:()=>({disconnected,removed})};
}

test('open group refreshes from server on INSERT and UPDATE, while coalescing bursts',async()=>{
 const {api,handlers,stats}=setup('lib/group-realtime.ts');
 let wakes=0;
 const unsubscribe=api.subscribeGroupChanges('jwt',GROUP,()=>{wakes++;});
 await new Promise(resolve=>setImmediate(resolve));
 await wait(90);
 assert.deepEqual(handlers.map(h=>h.filter.event),['INSERT','UPDATE']);
 assert.ok(handlers.every(h=>h.filter.table==='group_messages'));
 assert.ok(handlers.every(h=>h.filter.filter==='group_id=eq.'+GROUP));
 assert.equal(wakes,1,'subscription triggers one reconciliation fetch');
 handlers[0].callback({new:{body:'untrusted'}});
 handlers[1].callback({new:{body:'untrusted'}});
 handlers[1].callback({new:{body:'untrusted'}});
 await wait(90);
 assert.equal(wakes,2,'an event burst triggers only one authoritative refresh');
 unsubscribe();
 handlers[1].callback({new:{body:'late'}});
 await wait(90);
 assert.equal(wakes,2,'events after logout/unmount must not refresh the chat');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(stats().removed,1);
 assert.equal(stats().disconnected,1);
});

test('group UPDATE wakes group inbox once per burst, preserving direct refreshes',async()=>{
 const {api,handlers,stats}=setup('lib/inbox-realtime.ts');
 const wakes=[];
 const unsubscribe=api.subscribeInboxChanges('jwt',USER,kind=>wakes.push(kind));
 await new Promise(resolve=>setImmediate(resolve));
 await wait(90);
 assert.deepEqual(handlers.map(h=>h.filter.table+':'+h.filter.event),[
  'messages:INSERT','messages:UPDATE','group_messages:INSERT','group_messages:UPDATE'
 ]);
 assert.deepEqual(wakes,['direct','group']);
 handlers[3].callback({new:{body:'untrusted'}});
 handlers[3].callback({new:{body:'untrusted'}});
 handlers[1].callback({new:{body:'untrusted'}});
 handlers[1].callback({new:{body:'untrusted'}});
 await wait(90);
 assert.deepEqual(wakes,['direct','group','group','direct']);
 unsubscribe();
 handlers[3].callback({});
 await wait(90);
 assert.deepEqual(wakes,['direct','group','group','direct']);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(stats().removed,1);
 assert.equal(stats().disconnected,1);
});
