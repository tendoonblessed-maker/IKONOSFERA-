import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const CHANNEL='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function compile(handler=()=>({ok:true,json:async()=>[]}),timers={}){
 const source=read('lib/channel-discussion-pagination.ts');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const calls=[];
 const context={
  exports,URLSearchParams,URL,Date,AbortController,AbortSignal,Promise,Error,Map,Set,Array,Number,String,Math,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  setTimeout:timers.setTimeout??setTimeout,clearTimeout:timers.clearTimeout??clearTimeout,
  fetch:async(url,options)=>{calls.push({url,options});return handler(url,options,calls.length);},
  require(name){assert.equal(name,'@/lib/supabase-rest');return {apiUrl:'https://unit.test'};}
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'channel-discussion-pagination.cjs'});
 return {api:exports,calls};
}
const success=data=>({ok:true,json:async()=>data});
const uuid=n=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const stamp=n=>'2026-11-12T10:00:'+String(n).padStart(2,'0')+'.000000Z';
const message=(n,created_at=stamp(n),channel_id=CHANNEL)=>({
 id:uuid(n+100),channel_id,author_id:uuid(900),body:'message '+n,created_at
});
const comment=(n,created_at=stamp(n),channel_id=CHANNEL)=>({
 id:uuid(n+500),post_id:uuid(700),author_id:uuid(900),body:'comment '+n,created_at,
 channel_posts:{body:'post',channel_id}
});

test('discussion keyset paths are channel-scoped, bounded and deterministically ordered',()=>{
 const {api}=compile();
 const messages=new URL(api.discussionPagePath('message',CHANNEL),'https://unit.test');
 const comments=new URL(api.discussionPagePath('comment',CHANNEL),'https://unit.test');
 for(const url of [messages,comments]){
  assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
  assert.equal(url.searchParams.get('limit'),'51');
 }
 assert.equal(messages.pathname,'/rest/v1/channel_discussion_messages');
 assert.equal(messages.searchParams.get('channel_id'),'eq.'+CHANNEL);
 assert.equal(comments.pathname,'/rest/v1/channel_comments');
 assert.equal(comments.searchParams.get('channel_posts.channel_id'),'eq.'+CHANNEL);
});

test('cursor filters preserve global message-before-comment tie ordering',()=>{
 const {api}=compile();
 const cursor={created_at:'2026-11-12T10:00:12.123456+00:00',id:uuid(42),kind:'comment'};
 const messageUrl=new URL(api.discussionPagePath('message',CHANNEL,cursor),'https://unit.test');
 const commentUrl=new URL(api.discussionPagePath('comment',CHANNEL,cursor),'https://unit.test');
 assert.equal(messageUrl.searchParams.get('or'),
  '(created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lte.'+cursor.id+'))');
 assert.equal(commentUrl.searchParams.get('or'),
  '(created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+'))');
 const messageCursor={...cursor,kind:'message'};
 assert.match(new URL(api.discussionPagePath('comment',CHANNEL,messageCursor),'https://unit.test').searchParams.get('or'),/id\.lt\./);
});

test('malformed channel IDs and cursors are rejected before any request',()=>{
 const {api,calls}=compile();
 assert.throws(()=>api.discussionPagePath('message',CHANNEL+'x'),/канал/);
 assert.throws(()=>api.discussionPagePath('comment',CHANNEL,{created_at:'bad',id:uuid(1),kind:'message'}),/курсор/);
 assert.throws(()=>api.discussionPagePath('message',CHANNEL,{created_at:stamp(1),id:'bad',kind:'comment'}),/курсор/);
 assert.equal(calls.length,0);
});

test('combined page merges both sources, returns the newest 50 and a stable older cursor',async()=>{
 const messages=Array.from({length:35},(_,i)=>message(i));
 const comments=Array.from({length:25},(_,i)=>comment(i+35));
 const {api,calls}=compile(url=>{
  const parsed=new URL(url);
  return success(parsed.pathname.endsWith('channel_discussion_messages')?messages:comments);
 });
 const page=await api.listDiscussionFeedPage('signed-jwt',CHANNEL);
 assert.equal(calls.length,2);
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-jwt');
 assert.equal(calls[1].options.headers.apikey,'public-test');
 assert.equal(calls[0].options.cache,'no-store');
 assert.equal(calls[1].options.cache,'no-store');
 assert.equal(calls[0].options.signal,calls[1].options.signal);
 assert.equal(page.items.length,50);
 assert.equal(page.hasMore,true);
 assert.equal(page.items[0].created_at,stamp(10));
 assert.equal(page.items.at(-1).created_at,stamp(59));
 assert.deepEqual(Array.from(page.items,item=>item.kind),[
  ...Array(25).fill('message'),...Array(25).fill('comment')
 ]);
 assert.equal(page.cursor.created_at,stamp(10));
 assert.equal(page.cursor.id,uuid(110));
 assert.equal(page.cursor.kind,'message');
});

test('exactly one page has no false older-page affordance and foreign rows are discarded',async()=>{
 const messages=[message(1),message(2,stamp(2),OTHER)];
 const comments=[comment(3),comment(4,stamp(4),OTHER)];
 const {api}=compile(url=>{
  const parsed=new URL(url);
  return success(parsed.pathname.endsWith('channel_discussion_messages')?messages:comments);
 });
 const page=await api.listDiscussionFeedPage('jwt',CHANNEL);
 assert.equal(page.items.length,2);
 assert.equal(page.hasMore,false);
 assert.deepEqual(Array.from(page.items,item=>item.kind),['message','comment']);
});

test('microsecond timestamps and UUID ties have deterministic order',()=>{
 const {api}=compile();
 const rows=[
  {...message(1,'2026-11-12T10:00:00.000125Z'),kind:'message'},
  {...comment(1,'2026-11-12T10:00:00.000125Z'),kind:'comment'},
  {...message(2,'2026-11-12T10:00:00.000124Z'),kind:'message'},
  {...message(3,'2026-11-12T10:00:00.000125Z'),kind:'message'}
 ];
 rows.sort(api.compareDiscussionFeedItems);
 assert.deepEqual(rows.map(item=>item.id),[uuid(102),uuid(101),uuid(103),uuid(501)]);
});

test('merge keeps existing rows on overlap and sorts the combined timeline',()=>{
 const {api}=compile();
 const current=[{...message(2),kind:'message'}];
 const older=[
  {...message(1),kind:'message'},
  {...message(2,stamp(2)),kind:'message',body:'stale duplicate'}
 ];
 const merged=api.mergeDiscussionFeedItems(current,older);
 assert.equal(merged.length,2);
 assert.deepEqual(Array.from(merged,item=>item.id),[uuid(101),uuid(102)]);
 assert.equal(merged[1].body,'message 2');
});

test('a failed source read aborts the sibling request',async()=>{
 let siblingSignal;
 const {api}=compile((url,options)=>{
  const parsed=new URL(url);
  if(parsed.pathname.endsWith('channel_discussion_messages'))return Promise.reject(new Error('message source failed'));
  siblingSignal=options.signal;
  return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('sibling aborted')),{once:true}));
 });
 await assert.rejects(api.listDiscussionFeedPage('jwt',CHANNEL),/message source failed/);
 assert.equal(siblingSignal.aborted,true);
});

test('ChannelsPanel exposes bounded history, retry and scroll preservation',()=>{
 const component=read('components/ChannelsPanel.tsx');
 assert.match(component,/listDiscussionFeedPage/);
 assert.match(component,/loadOlderDiscussion/);
 assert.match(component,/discussionScrollAnchorRef/);
 assert.match(component,/scrollTop\s*=\s*anchor\.scrollTop\s*\+/);
 assert.match(component,/Показать более ранние сообщения/);
 assert.match(component,/discussionAbortRef\.current\?\.abort\(\)/);
 assert.doesNotMatch(component,/listDiscussionMessages\(token,channel\.id\)/);
 assert.doesNotMatch(component,/listDiscussionComments\(token,channel\.id\)/);
 assert.match(component,/abortDiscussionRequest\(\);setDiscussionItems\(\[\]\);setDiscussionCursor\(null\)/);
 assert.match(component,/setDiscussionError\(\"\"\);setOlderDiscussionError\(\"\"\)/);
 assert.doesNotMatch(component,/setDiscussionMessages|setDiscussionComments/);
});


test('malformed in-channel message timestamps are rejected before feed sorting',async()=>{
 const bad=message(7,'not-a-timestamp');
 const {api}=compile(url=>{
  const parsed=new URL(url);
  return success(parsed.pathname.endsWith('channel_discussion_messages')?[bad]:[]);
 });
 await assert.rejects(
  api.listDiscussionFeedPage('jwt',CHANNEL),
  /некорректную запись обсуждения канала/
 );
});

test('malformed in-channel comment relations and IDs fail closed',async()=>{
 const bad=comment(8);
 bad.id='not-a-uuid';
 const {api}=compile(url=>{
  const parsed=new URL(url);
  return success(parsed.pathname.endsWith('channel_comments')?[bad]:[]);
 });
 await assert.rejects(
  api.listDiscussionFeedPage('jwt',CHANNEL),
  /некорректную запись обсуждения канала/
 );
});

test('non-object PostgREST rows are rejected instead of crashing the feed merge',async()=>{
 const {api}=compile(url=>{
  const parsed=new URL(url);
  return success(parsed.pathname.endsWith('channel_discussion_messages')?[null]:[]);
 });
 await assert.rejects(
  api.listDiscussionFeedPage('jwt',CHANNEL),
  /некорректную запись обсуждения канала/
 );
});

const abortedError=()=>Object.assign(new Error('aborted'),{name:'AbortError'});

test('a pre-aborted owner signal rejects before issuing either GET',async()=>{
 const owner=new AbortController();
 owner.abort();
 const {api,calls}=compile();
 await assert.rejects(
  api.listDiscussionFeedPage('jwt',CHANNEL,undefined,owner.signal),
  error=>error?.name==='AbortError'
 );
 assert.equal(calls.length,0);
});

test('an owner abort cancels both in-flight source reads',async()=>{
 const owner=new AbortController();
 const signals=[];
 const {api,calls}=compile((url,options)=>{
  signals.push(options.signal);
  return new Promise((_,reject)=>{
   options.signal.addEventListener('abort',()=>reject(abortedError()),{once:true});
  });
 });
 const pending=api.listDiscussionFeedPage('jwt',CHANNEL,undefined,owner.signal);
 assert.equal(calls.length,2);
 owner.abort();
 await assert.rejects(pending,error=>error?.name==='AbortError');
 assert.equal(signals.length,2);
 assert.equal(signals[0],signals[1]);
 assert.equal(signals[0].aborted,true);
});

test('the 18-second deadline aborts both source reads and reports a timeout',async()=>{
 let fireDeadline;
 const timerId={};
 const timers={
  setTimeout(callback,delay){
   assert.equal(delay,18000);
   fireDeadline=callback;
   return timerId;
  },
  clearTimeout(id){assert.equal(id,timerId);}
 };
 const {api,calls}=compile((url,options)=>new Promise((_,reject)=>{
  options.signal.addEventListener('abort',()=>reject(abortedError()),{once:true});
 }),timers);
 const pending=api.listDiscussionFeedPage('jwt',CHANNEL);
 assert.equal(calls.length,2);
 assert.equal(typeof fireDeadline,'function');
 fireDeadline();
 await assert.rejects(pending,/Время ожидания загрузки обсуждения истекло/);
 assert.equal(calls[0].options.signal,calls[1].options.signal);
 assert.equal(calls[0].options.signal.aborted,true);
});
