import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {reconcileLoadedGroupMessage,abortGroupMessageReads,finishGroupMessageRead} from '../lib/group-message-reconciliation.ts';

const GROUP='11111111-1111-4111-8111-111111111111';
const OTHER_GROUP='33333333-3333-4333-8333-333333333333';
const MESSAGE='55555555-5555-4555-8555-555555555555';
const message=(id,changes={})=>({
 id,group_id:GROUP,sender_id:'22222222-2222-4222-8222-222222222222',
 body:'Текст',created_at:'2026-11-12T10:00:00.000Z',...changes
});

test('an edit reconciles a loaded older message in place without moving its scroll position',()=>{
 const before=message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 const edited=message(MESSAGE,{body:'Исправленный текст'});
 const after=message('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 const current=[before,message(MESSAGE),after];
 const result=reconcileLoadedGroupMessage(current,GROUP,MESSAGE,edited);
 assert.deepEqual(result,[before,edited,after]);
 assert.notEqual(result,current);
 assert.equal(result[0],before);
 assert.equal(result[2],after);
});

test('a missing RLS-scoped row removes a deleted loaded message but preserves surrounding history',()=>{
 const before=message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 const after=message('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 assert.deepEqual(reconcileLoadedGroupMessage([before,message(MESSAGE),after],GROUP,MESSAGE,null),[before,after]);
});

test('an update for a message outside the loaded window does not inject a distant row',()=>{
 const current=[message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')];
 assert.equal(reconcileLoadedGroupMessage(current,GROUP,MESSAGE,message(MESSAGE)),current);
});

test('a mismatched group or message row cannot replace a loaded message',()=>{
 const current=[message(MESSAGE)];
 assert.equal(reconcileLoadedGroupMessage(current,GROUP,MESSAGE,message(MESSAGE,{group_id:OTHER_GROUP})),current);
 assert.equal(reconcileLoadedGroupMessage(current,GROUP,MESSAGE,message('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),current);
});

function groupsHarness(rows,fetcher){
 const source=readFileSync(new URL('../lib/groups.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const calls=[];
 const exports={};
 vm.runInNewContext(compiled,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  fetch:async(url,init)=>{
   calls.push({url,init});
   if(fetcher)return fetcher(url,init,calls.length);
   return {ok:true,json:async()=>rows};
  },
  AbortSignal,
  JSON,
  Promise,
  encodeURIComponent,
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit.test'};
   throw Error('Unexpected module: '+name);
  }
 },{timeout:2000,filename:'groups.cjs'});
 return {api:exports,calls};
}

test('message reconciliation uses an authenticated GET scoped by both group and message UUID',async()=>{
 const row=message(MESSAGE,{body:'Текст с сервера'});
 const harness=groupsHarness([row]);
 const result=await harness.api.getGroupMessageById('signed-user-jwt',GROUP,MESSAGE);
 assert.deepEqual(result,row);
 assert.equal(harness.calls.length,1);
 assert.equal(harness.calls[0].init.method,'GET');
 assert.equal(harness.calls[0].init.headers.Authorization,'Bearer signed-user-jwt');
 const url=new URL(harness.calls[0].url);
 assert.equal(url.searchParams.get('group_id'),'eq.'+GROUP);
 assert.equal(url.searchParams.get('id'),'eq.'+MESSAGE);
 assert.equal(url.searchParams.get('limit'),'1');
});

test('a row hidden by existing group-member RLS is treated as absent',async()=>{
 const harness=groupsHarness([]);
 assert.equal(await harness.api.getGroupMessageById('signed-user-jwt',GROUP,MESSAGE),null);
});

test('invalid group or message UUIDs are rejected before making a request',async()=>{
 const harness=groupsHarness([]);
 await assert.rejects(()=>harness.api.getGroupMessageById('jwt','not-a-group',MESSAGE),/Неверные параметры/);
 await assert.rejects(()=>harness.api.getGroupMessageById('jwt',GROUP,'not-a-message'),/Неверные параметры/);
 assert.equal(harness.calls.length,0);
});

test('a mismatched response row is rejected instead of entering the timeline',async()=>{
 const harness=groupsHarness([message(MESSAGE,{group_id:OTHER_GROUP})]);
 await assert.rejects(()=>harness.api.getGroupMessageById('jwt',GROUP,MESSAGE),/актуальное сообщение/);
});

test('GroupPanel reconciles UPDATE IDs through RLS reads and retries pending IDs after resume',()=>{
 const panel=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/getGroupMessageById\(requestToken,requestGroup,id,controller\.signal\)/);
 assert.match(panel,/reconcileLoadedGroupMessage\(current,requestGroup,id,updated\)/);
 assert.match(panel,/pendingMessageUpdates\.add\(messageId\.toLowerCase\(\)\)/);
 assert.match(panel,/flushPendingMessageUpdates\(\)/);
 assert.match(panel,/pendingMessageUpdates\.clear\(\)/);
 assert.match(panel,/getGroupMessageById\(requestToken,requestGroup,id,controller\.signal\)/);
 assert.match(panel,/window\.setTimeout\(\(\)=>controller\.abort\(\),18000\)/);
 assert.match(panel,/abortGroupMessageReads\(messageUpdateRequests,pendingMessageUpdates\)/);
 assert.match(panel,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(panel,/window\.addEventListener\('offline',onOffline\)/);
 assert.match(panel,/finishGroupMessageRead\(messageUpdateRequests,id,controller\)/);
 assert.doesNotMatch(panel,/inFlightMessageUpdates/);
});

test('message reconciliation forwards a caller-owned AbortSignal to PostgREST',async()=>{
 const controller=new AbortController();
 const row=message(MESSAGE,{body:'Текст с сервера'});
 const harness=groupsHarness([row],async(_url,init)=>{
  assert.equal(init.signal,controller.signal);
  return {ok:true,json:async()=>[row]};
 });
 assert.deepEqual(await harness.api.getGroupMessageById('jwt',GROUP,MESSAGE,controller.signal),row);
});

test('aborting a group message reconciliation aborts the pending HTTP request',async()=>{
 const controller=new AbortController();
 let observedAbort=false;
 const harness=groupsHarness([],(_url,init)=>new Promise((_resolve,reject)=>{
  if(init.signal.aborted){
   observedAbort=true;
   reject(new DOMException('Aborted','AbortError'));
   return;
  }
  init.signal.addEventListener('abort',()=>{
   observedAbort=true;
   reject(new DOMException('Aborted','AbortError'));
  },{once:true});
 }));
 const pending=harness.api.getGroupMessageById('jwt',GROUP,MESSAGE,controller.signal);
 controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
 assert.equal(observedAbort,true);
});

test('pausing group history aborts active message reads and queues IDs for resume',()=>{
 const controller=new AbortController();
 const requests=new Map([[MESSAGE,{controller,timeoutId:17}]]);
 const pending=new Set();
 const cleared=[];
 abortGroupMessageReads(requests,pending,id=>cleared.push(id));
 assert.equal(controller.signal.aborted,true);
 assert.deepEqual(Array.from(pending),[MESSAGE]);
 assert.deepEqual(cleared,[17]);
 assert.equal(requests.get(MESSAGE).controller,controller);
});

test('a stale completion cannot clear a replacement request for the same message',()=>{
 const oldController=new AbortController();
 const currentController=new AbortController();
 const requests=new Map([[MESSAGE,{controller:currentController,timeoutId:23}]]);
 const cleared=[];
 finishGroupMessageRead(requests,MESSAGE,oldController,id=>cleared.push(id));
 assert.equal(requests.get(MESSAGE).controller,currentController);
 assert.deepEqual(cleared,[]);
 finishGroupMessageRead(requests,MESSAGE,currentController,id=>cleared.push(id));
 assert.equal(requests.has(MESSAGE),false);
 assert.deepEqual(cleared,[23]);
});
