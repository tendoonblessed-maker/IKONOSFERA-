import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {
 mergeConfirmedGroupMessages,
 CONFIRMED_GROUP_MESSAGE_GRACE_MS
} from '../lib/group-history.ts';

const GROUP='11111111-1111-4111-8111-111111111111';
const OTHER_GROUP='33333333-3333-4333-8333-333333333333';
const USER='22222222-2222-4222-8222-222222222222';
const OTHER='44444444-4444-4444-8444-444444444444';
const message=(id,changes={})=>({
 id,group_id:GROUP,sender_id:USER,body:'Текст',created_at:'2026-10-29T07:00:00.000Z',...changes
});

test('group message becomes visible immediately after server confirmation despite older poll',()=>{
 const now=1000;
 const first=message('a',{sender_id:OTHER,created_at:'2026-10-29T06:59:00.000Z'});
 const sent=message('b',{body:'Скоро буду'});
 const confirmations=new Map([[sent.id,{message:sent,expiresAt:now+CONFIRMED_GROUP_MESSAGE_GRACE_MS}]]);
 assert.deepEqual(mergeConfirmedGroupMessages([first],confirmations,GROUP,USER,now+10).map(x=>x.id),['a','b']);
 assert.equal(confirmations.size,1);
});

test('group read-back confirmation removes overlay and server version wins',()=>{
 const sent=message('a',{body:'Текст'});
 const updated=message('a',{body:'Текст на сервере'});
 const confirmations=new Map([[sent.id,{message:sent,expiresAt:99999}]]);
 const visible=mergeConfirmedGroupMessages([updated],confirmations,GROUP,USER,1000);
 assert.deepEqual(visible,[updated]);
 assert.equal(confirmations.size,0);
});

test('duplicate group messages never appear when event and poll race',()=>{
 const sent=message('a');
 const confirmations=new Map([[sent.id,{message:sent,expiresAt:99999}]]);
 assert.equal(mergeConfirmedGroupMessages([sent,sent],confirmations,GROUP,USER,1000).length,1);
});

test('a group event cannot introduce messages from another group or author',()=>{
 const otherGroup=message('a',{group_id:OTHER_GROUP});
 const otherSender=message('b',{sender_id:OTHER});
 const confirmations=new Map([
 [otherGroup.id,{message:otherGroup,expiresAt:99999}],
 [otherSender.id,{message:otherSender,expiresAt:99999}]
 ]);
 assert.deepEqual(mergeConfirmedGroupMessages([],confirmations,GROUP,USER,1000),[]);
});

test('confirmation protection expires after a minute so old messages are not resurrected',()=>{
 const sent=message('a');
 const confirmations=new Map([[sent.id,{message:sent,expiresAt:1100}]]);
 assert.deepEqual(mergeConfirmedGroupMessages([],confirmations,GROUP,USER,1101),[]);
 assert.equal(confirmations.size,0);
});

test('group messages remain in chronological order with deterministic equal timestamps',()=>{
 const first=message('a',{sender_id:OTHER,created_at:'2026-10-29T06:59:00.000Z'});
 const second=message('b');
 const third=message('c');
 const confirmations=new Map([[third.id,{message:third,expiresAt:99999}]]);
 const result=mergeConfirmedGroupMessages([second,first],confirmations,GROUP,USER,1000);
 assert.deepEqual(result.map(x=>x.id),['a','b','c']);
});

test('group realtime never renders WebSocket payload or stores another user session',()=>{
 const rt=readFileSync(new URL('../lib/group-realtime.ts',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../lib/groups.ts',import.meta.url),'utf8');
 assert.match(rt,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
 assert.match(rt,/client\.realtime\.setAuth\(token\)/);
 assert.match(rt,/table:'group_messages',filter:'group_id=eq\.'\+groupId/);
 assert.match(rt,/event:'INSERT'/);
 assert.match(rt,/event:'UPDATE'/);
 assert.match(rt,/event:'DELETE'/);
 assert.match(rt,/status==='SUBSCRIBED'\)changed\(\)/);
 assert.match(rt,/client\.removeChannel\(channel\)/);
 assert.match(rt,/client\.realtime\.disconnect\(\)/);
 assert.doesNotMatch(rt,/client\.from\('group_messages'\)|JSON\.parse\(payload/);
 assert.match(panel,/subscribeGroupChanges\(token,group\.id,onRealtimeChanged\)/);
 assert.match(panel,/if\(inFlight\)\{queuedSync=true;return;\}/);
 assert.match(panel,/if\(queuedSync&&!cancelled\)\{queuedSync=false;sync\(\);\}/);
 assert.match(panel,/window\.setInterval\(sync,6000\)/);
 assert.match(panel,/window\.addEventListener\('online',onOnline\)/);
 assert.match(panel,/unsubscribeRealtime\(\)/);
 assert.match(panel,/const sent=await sendGroupMessage\(requestToken,groupId,accountId,body,attempt\.id\)/);
 assert.doesNotMatch(panel.slice(panel.indexOf('async function send('),panel.indexOf('const names=')),/await refresh\(/);
 assert.match(panel,/mergeConfirmedGroupMessages\(/);
 assert.match(api,/row\.id!==messageId\|\|row\.group_id!==groupId\|\|row\.sender_id!==userId\|\|row\.body!==body/);
});

test('migration only adds group messages to existing publication, retaining member RLS',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261029071053_enable_group_message_realtime.sql',import.meta.url),'utf8');
 assert.match(sql,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.group_messages/);
 assert.match(sql,/pg_publication_tables/);
 assert.doesNotMatch(sql,/drop publication|replica identity full|disable row level security|grant all/i);
});

async function realtimeHarness(){
 const source=readFileSync(new URL('../lib/group-realtime.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const registrations=[];
 let subscribeCallback=null,authToken='',channelName='';
 let removed=0,disconnects=0;
 const channel={
  on(type,filter,callback){registrations.push({type,filter,callback});return channel;},
  subscribe(callback){subscribeCallback=callback;return channel;}
 };
 const client={
  channel(name){channelName=name;return channel;},
  realtime:{
   setAuth:async token=>{authToken=token;},
   disconnect(){disconnects++;}
  },
  removeChannel:async value=>{assert.equal(value,channel);removed++;return 'ok';}
 };
 const exports={};
 vm.runInNewContext(compiled,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  window:{},
  Promise,
  require(name){
   if(name==='@supabase/supabase-js')return {createClient:()=>client};
   if(name==='./supabase-rest')return {apiUrl:'https://unit.test',backendReady:true};
   throw Error('Unexpected module: '+name);
  }
 },{timeout:2000,filename:'group-realtime.cjs'});
 return {api:exports,registrations,client,channel,get authToken(){return authToken;},
  get channelName(){return channelName;},get subscribeCallback(){return subscribeCallback;},
  get removed(){return removed;},get disconnects(){return disconnects;}};
}

test('group realtime forwards validated UPDATE and DELETE ids only as scoped read hints',async()=>{
 const harness=await realtimeHarness();
 const wakeups=[];
 const unsubscribe=harness.api.subscribeGroupChanges('signed-user-jwt',GROUP,id=>{wakeups.push(id);});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(harness.authToken,'signed-user-jwt');
 assert.equal(harness.channelName,'group-db:'+GROUP);
 const byEvent=new Map(harness.registrations.map(item=>[item.filter.event,item]));
 assert.deepEqual(Array.from(byEvent.keys()),['INSERT','UPDATE','DELETE']);
 for(const item of harness.registrations){
  assert.equal(item.type,'postgres_changes');
  assert.equal(item.filter.schema,'public');
  assert.equal(item.filter.table,'group_messages');
 }
 assert.equal(byEvent.get('INSERT').filter.filter,'group_id=eq.'+GROUP);
 assert.equal(byEvent.get('UPDATE').filter.filter,'group_id=eq.'+GROUP);
 assert.equal(byEvent.get('DELETE').filter.filter,undefined,
  'DELETE has no group filter because Postgres Changes cannot reliably filter it');
 byEvent.get('INSERT').callback({
  new:{id:'55555555-5555-4555-8555-555555555555',body:'private message body'}
 });
 byEvent.get('UPDATE').callback({
  new:{id:'55555555-5555-4555-8555-555555555555',body:'private message body'},
  old:{body:'old private body'}
 });
 byEvent.get('UPDATE').callback({new:{id:'not-a-uuid',body:'must not be forwarded'}});
 byEvent.get('DELETE').callback({
  old:{id:'55555555-5555-4555-8555-555555555555',group_id:OTHER_GROUP,body:'another group'}
 });
 byEvent.get('DELETE').callback({
  old:{id:'55555555-5555-4555-8555-555555555555',group_id:GROUP,body:'private delete payload'}
 });
 byEvent.get('DELETE').callback({
  old:{id:'55555555-5555-4555-8555-555555555555',body:'default replica identity may expose only the PK'}
 });
 byEvent.get('DELETE').callback({old:{id:'not-a-uuid',group_id:GROUP,body:'invalid ID'}});
 assert.deepEqual(wakeups,[
  undefined,
  '55555555-5555-4555-8555-555555555555',
  undefined,
  '55555555-5555-4555-8555-555555555555',
  '55555555-5555-4555-8555-555555555555',
  undefined
 ]);
 assert.ok(wakeups.every(value=>value===undefined||value==='55555555-5555-4555-8555-555555555555'),
  'only a validated message UUID or an empty refresh hint may leave the callback');
 harness.subscribeCallback('SUBSCRIBED');
 assert.equal(wakeups.length,7);
 assert.equal(wakeups[6],undefined,'subscription readiness reconciles any missed events');
 unsubscribe();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(harness.removed,1);
 assert.equal(harness.disconnects,1);
 byEvent.get('DELETE').callback({old:{id:'55555555-5555-4555-8555-555555555555'}});
 assert.equal(wakeups.length,7,'disposed subscriptions ignore late DELETE callbacks');
});
