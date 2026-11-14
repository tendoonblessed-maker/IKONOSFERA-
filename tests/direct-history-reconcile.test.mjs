import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function compile(path,bindings={}){
 const source=read(path);
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  Date,Promise,Math,JSON,URLSearchParams,AbortSignal,AbortController,DOMException,Error,Map,Set,
  Number,Array,Object,String,encodeURIComponent,setTimeout,clearTimeout,...bindings
 };
 vm.runInNewContext(compiled,context,{timeout:2000});
 return exports;
}

const chat='11111111-1111-4111-8111-111111111111';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id1='22222222-2222-4222-8222-222222222222';
const id2='33333333-3333-4333-8333-333333333333';
const id3='44444444-4444-4444-8444-444444444444';
const message=(id,overrides={})=>({
 id,chat_id:chat,sender_id:owner,body:'message',created_at:'2026-11-13T12:00:00.000000Z',
 media_path:null,media_type:null,read_at:null,edited_at:null,deleted_for:[],deleted_for_everyone:false,
 reply_to_message_id:null,...overrides
});

test('visible direct-message IDs include only viewport intersections and are deduplicated',()=>{
 const {visibleDirectMessageIds}=compile('lib/chat-history.ts');
 const nodes=[
  {id:'ik-chat-message-'+id1,getBoundingClientRect:()=>({top:90,bottom:130})},
  {id:'ik-chat-message-'+id1.toUpperCase(),getBoundingClientRect:()=>({top:140,bottom:170})},
  {id:'ik-chat-message-'+id2,getBoundingClientRect:()=>({top:390,bottom:410})},
  {id:'ik-chat-message-'+id3,getBoundingClientRect:()=>({top:401,bottom:430})},
  {id:'ik-chat-message-not-a-uuid',getBoundingClientRect:()=>({top:150,bottom:180})}
 ];
 const container={getBoundingClientRect:()=>({top:100,bottom:400}),querySelectorAll:()=>nodes};
 assert.deepEqual(Array.from(visibleDirectMessageIds(container)),[id1,id2]);
 assert.deepEqual(Array.from(visibleDirectMessageIds(null)),[]);
});

test('visible direct-message reconciliation updates tombstones, removes absent rows and preserves offscreen history',()=>{
 const {reconcileVisibleDirectMessages}=compile('lib/chat-history.ts');
 const old1=message(id1),old2=message(id2),offscreen=message(id3);
 const tombstone=message(id1,{body:'',deleted_for_everyone:true,media_path:null,media_type:null});
 const current=[old1,old2,offscreen];
 const result=reconcileVisibleDirectMessages(current,[id1,id2],[tombstone],chat,owner,new Map(),1000);
 assert.deepEqual(Array.from(result,m=>m.id),[id1,id3]);
 assert.equal(result[0].deleted_for_everyone,true);
 assert.equal(result[0].body,'');
 assert.equal(result[1],offscreen);
});

test('a recently confirmed send is not removed by a temporarily incomplete RLS read',()=>{
 const {reconcileVisibleDirectMessages}=compile('lib/chat-history.ts');
 const confirmedMessage=message(id2);
 const confirmed=new Map([[id2,{message:confirmedMessage,expiresAt:2000}]]);
 const result=reconcileVisibleDirectMessages([confirmedMessage],[id2],[],chat,owner,confirmed,1500);
 assert.equal(result.length,1);
 assert.equal(result[0],confirmedMessage);
 const expired=reconcileVisibleDirectMessages([confirmedMessage],[id2],[],chat,owner,confirmed,2500);
 assert.equal(expired.length,0);
 assert.equal(confirmed.has(id2),false);
});

test('reconciliation ignores foreign-chat and unrequested server rows and never appends them',()=>{
 const {reconcileVisibleDirectMessages}=compile('lib/chat-history.ts');
 const current=[message(id1)];
 const foreign=message(id1,{chat_id:'99999999-9999-4999-8999-999999999999',body:'foreign'});
 const unrequested=message(id2);
 const result=reconcileVisibleDirectMessages(current,[id1],[foreign,unrequested],chat,owner,new Map(),1000);
 assert.equal(result.length,1);
 assert.equal(result[0],current[0]);
});

test('direct-message reconciliation GET is scoped, bounded, validated and forwards its AbortSignal',async()=>{
 let captured;
 const rows=[message(id1)];
 const {listExistingDirectMessages}=compile('lib/supabase-rest.ts',{
  fetch:async(url,options)=>{
   captured={url:String(url),options};
   return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
  }
 });
 const controller=new AbortController();
 const result=await listExistingDirectMessages('test-access-token',chat,[id1,id1.toUpperCase()],controller.signal);
 assert.equal(result.length,1);
 assert.match(captured.url,/chat_id=eq\.11111111-1111-4111-8111-111111111111/);
 assert.match(captured.url,/id=in\.\(22222222-2222-4222-8222-222222222222\)/);
 assert.match(captured.url,/deleted_for_everyone/);
 assert.equal(captured.options.headers.Authorization,'Bearer test-access-token');
 assert.equal(captured.options.cache,'no-store');
 assert.notEqual(captured.options.signal,controller.signal,'the helper combines caller cancellation with its request deadline');
});

test('direct-message reconciliation rejects malformed or oversized ID sets before HTTP',async()=>{
 let requests=0;
 const {listExistingDirectMessages}=compile('lib/supabase-rest.ts',{fetch:async()=>{requests++;throw Error('unexpected fetch')}});
 await assert.rejects(listExistingDirectMessages('token',chat,['not-a-uuid']),/Некорректный идентификатор/);
 const many=Array.from({length:81},(_,i)=>'00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'));
 await assert.rejects(listExistingDirectMessages('token',chat,many),/Слишком много/);
 assert.equal(requests,0);
});

test('direct-message reconciliation abort cancels both the request and response-body read',async()=>{
 let receivedSignal;
 const {listExistingDirectMessages}=compile('lib/supabase-rest.ts',{
  fetch:(_url,options)=>new Promise((_resolve,reject)=>{
   receivedSignal=options.signal;
   options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
  })
 });
 const controller=new AbortController();
 const pending=listExistingDirectMessages('token',chat,[id1],controller.signal);
 await Promise.resolve();
 assert.ok(receivedSignal);
 controller.abort();
 await assert.rejects(pending,error=>error?.name==='AbortError');
});

test('AppShell reconciles only visible direct history after commits, Realtime, scroll and resume',()=>{
 const shell=read('components/AppShell.tsx');
 const realtime=read('lib/direct-realtime.ts');
 assert.match(shell,/visibleDirectMessageIds\(conversationHistoryRef\.current\)/);
 assert.match(shell,/listExistingDirectMessages\(token,chatId,ids,controller\.signal\)/);
 assert.match(shell,/reconcileVisibleDirectMessages\(/);
 assert.match(shell,/DIRECT_MESSAGE_RECONCILE_COOLDOWN_MS/);
 assert.match(shell,/directHistoryReconcileRef\.current\?\.\(false\)/);
 assert.match(shell,/void reconcileVisibleMessages\(true\)/);
 assert.match(shell,/syncRevision\+\+/);
 assert.match(shell,/revision!==syncRevision/);
 assert.match(shell,/reconcileController\?\.abort\(\)/);
 assert.match(shell,/invalidateDirectHistorySyncRef\.current\?\.\(\)/);
 assert.match(shell,/directHistoryReconcileRef\.current\?\.\(true\)/);
 assert.match(shell,/if\(selectedRef\.current===chatId\)\{\s*invalidateDirectHistorySyncRef/);
 assert.match(realtime,/event:'UPDATE'/);
 assert.doesNotMatch(realtime,/event:'DELETE'/);
});

test('visible-message selection is capped at the bounded RLS request size',()=>{
 const {visibleDirectMessageIds}=compile('lib/chat-history.ts');
 const nodes=Array.from({length:90},(_,i)=>({
  id:'ik-chat-message-00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),
  getBoundingClientRect:()=>({top:100+i,bottom:101+i})
 }));
 const container={getBoundingClientRect:()=>({top:0,bottom:500}),querySelectorAll:()=>nodes};
 assert.equal(visibleDirectMessageIds(container).length,80);
});


test('a viewport change during reconciliation queues one fresh visible-message read',()=>{
 const {sameVisibleDirectMessageIds,shouldQueueDirectHistoryReconcile}=compile('lib/chat-history.ts');
 const inFlight=[id1,id2,id3];

 assert.equal(sameVisibleDirectMessageIds(inFlight,[id3,id2,id1]),true,
  'the same visible set in a different DOM order does not need another request');
 assert.equal(shouldQueueDirectHistoryReconcile(inFlight,[id3,id2,id1]),false);
 assert.equal(shouldQueueDirectHistoryReconcile(inFlight,[id2,id3,'55555555-5555-4555-8555-555555555555']),true,
  'a reader who scrolls to a different visible page must get a fresh RLS snapshot');
 assert.equal(shouldQueueDirectHistoryReconcile(inFlight,[id1,id2,id3],true),true,
  'Realtime and local edit/delete wake-ups still force a follow-up even for the same viewport');
 assert.equal(shouldQueueDirectHistoryReconcile(inFlight,[],false),false,
  'an empty viewport does not schedule a pointless request');

 const shell=read('components/AppShell.tsx');
 assert.match(shell,/shouldQueueDirectHistoryReconcile/);
 assert.match(shell,/reconcileInFlightIds=ids\.slice\(\)/);
 assert.match(shell,/reconcileInFlightIds=null/);
});


test('delayed history pages and post-edit refreshes are rejected after a newer chat revision',async()=>{
 const {shouldApplyDirectHistorySnapshot}=compile('lib/chat-history.ts');
 let currentEpoch=12;
 const requestEpoch=currentEpoch;
 let resolveResponse;
 const response=new Promise(resolve=>{resolveResponse=resolve;});
 const applied=response.then(rows=>shouldApplyDirectHistorySnapshot(requestEpoch,currentEpoch,true)?rows:null);
 // Realtime, a local edit/delete, or a lifecycle invalidation advances the epoch
 // while the old pagination GET is still waiting for its response.
 currentEpoch++;
 resolveResponse([message(id1,{body:'stale server snapshot'})]);
 assert.equal(await applied,null);
 assert.equal(shouldApplyDirectHistorySnapshot(currentEpoch,currentEpoch,true),true);
 assert.equal(shouldApplyDirectHistorySnapshot(currentEpoch,currentEpoch,false),false,
  'a response from a previous chat context must never be committed');

 const shell=read('components/AppShell.tsx');
 assert.match(shell,/const directHistorySyncEpochRef=useRef\\(0\\)/);
 assert.match(shell,/const invalidateSync=\\(\\)=>\\{syncRevision\\+\\+;directHistorySyncEpochRef\\.current\\+\\+;\\}/);
 const olderStart=shell.indexOf('async function loadOlderChatMessages');
 const olderEnd=shell.indexOf('function scrollToHistoryMessage',olderStart);
 const older=shell.slice(olderStart,olderEnd);
 assert.match(older,/const syncEpoch=directHistorySyncEpochRef\\.current/);
 assert.match(older,/shouldApplyDirectHistorySnapshot\\(syncEpoch,directHistorySyncEpochRef\\.current,stillInChat\\(\\)\\)/);
 assert.match(older,/setChatMessages\\(current=>isCurrentPage\\(\\)\\?prependEarlierPage/);
 const actionStart=shell.indexOf('async function messageAction');
 const actionEnd=shell.indexOf('async function reactToMessage',actionStart);
 const action=shell.slice(actionStart,actionEnd);
 assert.match(action,/const refreshEpoch=directHistorySyncEpochRef\\.current/);
 assert.match(action,/shouldApplyDirectHistorySnapshot\\(refreshEpoch,directHistorySyncEpochRef\\.current,stillInChat\\(\\)\\)/);
});
