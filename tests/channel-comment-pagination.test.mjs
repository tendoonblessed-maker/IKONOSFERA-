import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const POST='11111111-1111-4111-8111-111111111111';
const OTHER_POST='22222222-2222-4222-8222-222222222222';
const AUTHOR='33333333-3333-4333-8333-333333333333';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function compile(path,bindings={}){
 const source=read(path);
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,URLSearchParams,URL,Date,Promise,Error,Map,Set,JSON,...bindings},{timeout:2000,filename:path+'.cjs'});
 return exports;
}
const pagination=compile('lib/channel-comment-pagination.ts');

function uuid(n){
 return n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
}
function comment(n,created_at=timestampAt(n),post_id=POST){
 return {id:uuid(n),post_id,author_id:AUTHOR,body:'comment '+n,created_at};
}
function timestampAt(index){
 return new Date(Date.parse('2026-11-10T09:00:00.000Z')-index*1000).toISOString();
}
function socialHarness(handler){
 const calls=[];
 const compiled=ts.transpileModule(read('lib/social.ts'),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={};
 const context={
  exports,URLSearchParams,Date,Promise,Error,JSON,process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  fetch:async(url,options)=>{calls.push({url,options});return handler(url,options,calls.length);},
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit.test'};
   if(name==='@/lib/channel-post-pagination')return {};
   if(name==='@/lib/channel-comment-pagination')return pagination;
   throw Error('Unexpected module '+name);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'social.cjs'});
 return {api:exports,calls};
}
const response=data=>({ok:true,status:200,json:async()=>data});

test('comment first page is scoped to one post and uses deterministic newest-first keyset order',()=>{
 const url=new URL(pagination.channelCommentsPagePath(POST),'https://unit.test');
 assert.equal(url.pathname,'/rest/v1/channel_comments');
 assert.equal(url.searchParams.get('post_id'),'eq.'+POST);
 assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
 assert.equal(url.searchParams.get('limit'),'51');
 assert.equal(url.searchParams.has('or'),false);
});

test('older comment cursor uses exact timestamp plus UUID tie-breaker',()=>{
 const cursor={id:uuid(9),created_at:'2026-11-10T09:00:00.123456+00:00'};
 const url=new URL(pagination.channelCommentsPagePath(POST,cursor),'https://unit.test');
 assert.equal(url.searchParams.get('or'),
  '(created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+'))');
 assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
 assert.equal(url.searchParams.get('limit'),'51');
});

test('invalid post IDs and malformed cursor values are rejected before network access',()=>{
 assert.throws(()=>pagination.channelCommentsPagePath('not-a-uuid'),/публикации/);
 assert.throws(()=>pagination.channelCommentsPagePath(POST,{id:'bad',created_at:'2026-11-10T09:00:00Z'}),/курсор/);
 assert.throws(()=>pagination.channelCommentsPagePath(POST,{id:uuid(1),created_at:'2026-11-10T09:00:00Z,post_id.eq.'+OTHER_POST}),/курсор/);
 assert.throws(()=>pagination.channelCommentsPagePath(POST,{id:uuid(1),created_at:'2026-11-10T09:00:00.1234567Z'}),/курсор/);
});

test('older comments prepend in chronological order and current rows win on overlap',()=>{
 const current=[comment(1),comment(2)];
 current[1].body='edited current row';
 const older=[comment(3),comment(2)];
 older[1].body='stale overlapping row';
 const merged=pagination.prependOlderChannelComments(current,older);
 assert.deepEqual(Array.from(merged,c=>c.id),[uuid(3),uuid(1),uuid(2)]);
 assert.equal(merged[2].body,'edited current row');
});

test('first comment page returns the newest 50 in chronological display order and detects the sentinel',async()=>{
 const rows=Array.from({length:51},(_,i)=>comment(i+1,timestampAt(i)));
 const {api,calls}=socialHarness(()=>response(rows));
 const page=await api.listPostCommentsPage('signed-jwt',POST);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-jwt');
 assert.equal(calls[0].options.headers.apikey,'public-test');
 assert.equal(calls[0].options.cache,'no-store');
 assert.equal(page.comments.length,50);
 assert.equal(page.comments[0].id,rows[49].id);
 assert.equal(page.comments[49].id,rows[0].id);
 assert.equal(page.hasMore,true);
});

test('exactly 50 comments do not expose a false older-page control',async()=>{
 const rows=Array.from({length:50},(_,i)=>comment(i+1,timestampAt(i)));
 const {api}=socialHarness(()=>response(rows));
 const page=await api.listPostCommentsPage('jwt',POST);
 assert.equal(page.comments.length,50);
 assert.equal(page.hasMore,false);
});

test('the next keyset page starts at the previous sentinel without skipping comments',async()=>{
 const firstRows=Array.from({length:51},(_,i)=>comment(i+1,timestampAt(i)));
 const secondRows=[firstRows[50],...Array.from({length:9},(_,i)=>comment(52+i,new Date(Date.parse(firstRows[50].created_at)-(i+1)*1000).toISOString()))];
 const {api,calls}=socialHarness((_url,_options,n)=>response(n===1?firstRows:secondRows));
 const first=await api.listPostCommentsPage('jwt',POST);
 const second=await api.listPostCommentsPage('jwt',POST,first.comments[0]);
 assert.equal(second.comments[0].id,secondRows[9].id);
 assert.equal(second.comments.at(-1).id,firstRows[50].id);
 assert.equal(second.comments.length,10);
 assert.equal(second.hasMore,false);
 const cursorUrl=new URL(calls[1].url);
 assert.ok(cursorUrl.searchParams.get('or').includes('id.lt.'+first.comments[0].id));
 const merged=pagination.prependOlderChannelComments(first.comments,second.comments);
 assert.equal(merged.length,60);
 assert.equal(merged[0].id,secondRows[9].id);
 // The sentinel is the first row on the next page and must sit directly before the old visible boundary.
 assert.equal(merged[9].id,firstRows[50].id);
 assert.equal(merged[10].id,first.comments[0].id);
});

test('rows from another post are filtered before sentinel calculation',async()=>{
 const rows=[comment(1),comment(2),comment(3,'2026-11-10T09:00:00Z',OTHER_POST)];
 const {api}=socialHarness(()=>response(rows));
 const page=await api.listPostCommentsPage('jwt',POST);
 assert.deepEqual(Array.from(page.comments,c=>c.post_id),[POST,POST]);
 assert.equal(page.hasMore,false);
});

test('legacy listPostComments remains an array and exposes hasMore metadata',async()=>{
 const rows=Array.from({length:51},(_,i)=>comment(i+1,timestampAt(i)));
 const {api}=socialHarness(()=>response(rows));
 const result=await api.listPostComments('jwt',POST);
 assert.equal(Array.isArray(result),true);
 assert.equal(result.length,50);
 assert.equal(result.hasMore,true);
});

test('ChannelsPanel exposes guarded, retryable older-comment pagination without changing post scoping',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/listPostCommentsPage/);
 assert.match(panel,/prependOlderChannelComments/);
 assert.match(panel,/const oldest=comments\[0\]/);
 assert.match(panel,/listPostCommentsPage\(token,postId,oldest\)/);
 assert.match(panel,/commentsPostRef\.current===postId/);
 assert.match(panel,/commentsRequestGuard\.begin\(\)/);
 assert.match(panel,/Показать более ранние комментарии/);
 assert.match(panel,/olderCommentsError&&/);
 assert.match(panel,/setHasOlderComments\(list\.hasMore\)/);
 assert.match(panel,/setHasOlderComments\(page\.hasMore\)/);
});
