import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {isLatestAccountSnapshot} from '../lib/inbox-snapshot.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';

test('a stale HTTP snapshot cannot overwrite a newer Realtime inbox refresh',()=>{
 assert.equal(isLatestAccountSnapshot(10,11,OWNER,OWNER),false);
 assert.equal(isLatestAccountSnapshot(12,12,OWNER,OWNER),true);
 assert.equal(isLatestAccountSnapshot(13,12,OWNER,OWNER),false);
});

test('a previous logged-in account cannot commit previews or group badges',()=>{
 assert.equal(isLatestAccountSnapshot(7,7,OWNER,OTHER),false);
 assert.equal(isLatestAccountSnapshot(7,7,OWNER,''),false);
 assert.equal(isLatestAccountSnapshot(7,7,'',OWNER),false);
 assert.equal(isLatestAccountSnapshot(7,7,OTHER,OTHER),true);
});

test('a late request after logout or an account switch is rejected',()=>{
 let revision=1;
 let owner=OWNER;
 const requestId=revision;
 revision++;owner='';
 assert.equal(isLatestAccountSnapshot(requestId,revision,OWNER,owner),false);
 revision++;owner=OTHER;
 assert.equal(isLatestAccountSnapshot(requestId,revision,OWNER,owner),false);
});

test('inbox Realtime only wakes RLS-backed server fetches',()=>{
 const rt=load('lib/inbox-realtime.ts');
 assert.match(rt,/client\.realtime\.setAuth\(token\)/);
 assert.match(rt,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
 assert.match(rt,/table:'messages',event:'INSERT'/);
 assert.match(rt,/table:'messages',event:'UPDATE'/);
 assert.match(rt,/table:'group_messages',event:'INSERT'/);
 assert.match(rt,/table:'group_messages',event:'UPDATE'/);
 assert.match(rt,/if\(status==='SUBSCRIBED'\)\{direct\(\);group\(\);\}/);
 assert.match(rt,/client\.removeChannel\(channel\)/);
 assert.match(rt,/client\.realtime\.disconnect\(\)/);
 assert.doesNotMatch(rt,/\.from\('messages'\)|\.from\('group_messages'\)|payload\.new|service_role/i);
});

test('group edits and soft-deletes wake the inbox without exposing Realtime payloads',async()=>{
 const source=load('lib/inbox-realtime.ts');
 const compiled=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
 const module={exports:{}};
 const registrations=[];
 let onStatus=null;
 let authToken=null;
 let removed=false;
 let disconnected=false;
 const channel={
  on(_event,filter,callback){registrations.push({filter,callback});return this;},
  subscribe(callback){onStatus=callback;return this;}
 };
 const client={
  channel(name){assert.equal(name,'inbox-db:'+OWNER);return channel;},
  realtime:{
   setAuth(token){authToken=token;return Promise.resolve();},
   disconnect(){disconnected=true;}
  },
  removeChannel(candidate){assert.equal(candidate,channel);removed=true;return Promise.resolve('ok');}
 };
 const context={
  module,exports:module.exports,
  require(name){
   if(name==='@supabase/supabase-js')return {createClient:()=>client};
   if(name==='./supabase-rest')return {apiUrl:'https://unit.test',backendReady:true};
   throw Error('Unexpected module: '+name);
  },
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-key'}},
  window:{},Promise,Object,Array,Map,Set,String,Number,Boolean,RegExp,Date,Math,JSON
 };
 vm.runInNewContext(compiled,context,{timeout:1000});
 const changes=[];
 const unsubscribe=module.exports.subscribeInboxChanges('jwt',OWNER,kind=>changes.push(kind));
 await new Promise(resolve=>setImmediate(resolve));

 assert.equal(authToken,'jwt');
 assert.ok(onStatus,'channel subscription should be installed after JWT authorization');
 const groupUpdate=registrations.find(item=>
  item.filter.table==='group_messages'&&item.filter.event==='UPDATE'
 );
 assert.ok(groupUpdate,'group message UPDATE must refresh the inbox preview');
 groupUpdate.callback({new:{group_id:OTHER,body:'must never reach UI'}});
 assert.deepEqual(changes,['group']);

 unsubscribe();
 assert.equal(removed,true);
 groupUpdate.callback({new:{group_id:OTHER,body:'late event'}});
 assert.deepEqual(changes,['group'],'disposed subscriptions must ignore late events');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(disconnected,true);
});

test('both the full and lightweight inbox discard older responses and avoid stale preview cache',()=>{
 const shell=load('components/AppShell.tsx');
 assert.match(shell,/const requestId=\+\+previewRequestRef\.current/);
 assert.match(shell,/isLatestAccountSnapshot\(requestId,previewRequestRef\.current,ownerId,previewCacheRef\.current\.ownerId\)/);
 assert.match(shell,/const inboxRequest=\+\+inboxRequestRef\.current/);
 assert.match(shell,/isLatestAccountSnapshot\(inboxRequest,inboxRequestRef\.current,id,inboxOwnerRef\.current\)/);
 assert.match(shell,/const groupRequest=\+\+groupOverviewRequestRef\.current/);
 assert.match(shell,/isLatestAccountSnapshot\(groupRequest,groupOverviewRequestRef\.current,id,inboxOwnerRef\.current\)/);
 assert.match(shell,/isLatestAccountSnapshot\(requestId,inboxRequestRef\.current,id,inboxOwnerRef\.current\)/);
 assert.match(shell,/inboxOwnerRef\.current='';\s*inboxRequestRef\.current\+\+;\s*previewRequestRef\.current\+\+;\s*groupOverviewRequestRef\.current\+\+/);
});

test('inbox Realtime never replaces six-second conversation and twelve-second inbox fallbacks',()=>{
 const shell=load('components/AppShell.tsx');
 assert.match(shell,/window\.setInterval\(\(\)=>void sync\(\),6000\)/);
 assert.match(shell,/window\.setInterval\(\(\)=>void run\(\),12000\)/);
 assert.match(shell,/document\.addEventListener\('visibilitychange',onVisible\)/);
 assert.match(shell,/window\.addEventListener\('online',onConnected\)/);
 assert.match(load('lib/inbox-realtime.ts'),/return\(\)=>\{\};/);
});
