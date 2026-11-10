import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const CHANNEL='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
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
const pagination=compile('lib/channel-post-pagination.ts');

function uuid(n){
 return n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
}
function post(n,created_at='2026-11-10T09:00:00.000000Z',channel_id=CHANNEL){
 return {id:uuid(n),channel_id,author_id:AUTHOR,body:'post '+n,image_path:null,created_at};
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
   if(name==='@/lib/channel-post-pagination')return pagination;
   if(name==='@/lib/media-object-path')return {deleteMediaObject:async()=>{}};
   throw Error('Unexpected module '+name);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'social.cjs'});
 return {api:exports,calls};
}
const response=data=>({ok:true,status:200,json:async()=>data});
const timestampAt=index=>new Date(Date.parse('2026-11-10T09:00:00.000Z')-index*1000).toISOString();

test('channel feed first page uses channel scope, deterministic order and one sentinel row',()=>{
 const url=new URL(pagination.channelPostsPagePath(CHANNEL),'https://unit.test');
 assert.equal(url.pathname,'/rest/v1/channel_posts');
 assert.equal(url.searchParams.get('select'),'*');
 assert.equal(url.searchParams.get('channel_id'),'eq.'+CHANNEL);
 assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
 assert.equal(url.searchParams.get('limit'),'101');
 assert.equal(url.searchParams.has('or'),false);
});

test('older channel page uses timestamp plus UUID keyset cursor',()=>{
 const cursor={id:uuid(9),created_at:'2026-11-10T09:00:00.123456+00:00'};
 const url=new URL(pagination.channelPostsPagePath(CHANNEL,cursor),'https://unit.test');
 assert.equal(url.searchParams.get('or'),
  '(created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.lt.'+cursor.id+'))');
 assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
 assert.equal(url.searchParams.get('limit'),'101');
});

test('invalid channel IDs and malformed cursor filters are rejected before a request',()=>{
 assert.throws(()=>pagination.channelPostsPagePath('not-a-uuid'),/канала/);
 assert.throws(()=>pagination.channelPostsPagePath(CHANNEL,{id:'bad',created_at:'2026-11-10T09:00:00Z'}),/курсор/);
 assert.throws(()=>pagination.channelPostsPagePath(CHANNEL,{id:uuid(1),created_at:'2026-11-10T09:00:00Z,channel_id.eq.'+OTHER}),/курсор/);
 assert.throws(()=>pagination.channelPostsPagePath(CHANNEL,{id:uuid(1),created_at:'2026-11-10T09:00:00.1234567Z'}),/курсор/);
});

test('appending an older page deduplicates overlap and keeps the current post version',()=>{
 const current=[post(1),post(2)];
 current[1].body='edited current row';
 const older=[post(2),post(3)];
 older[0].body='stale overlapping row';
 const merged=pagination.appendOlderChannelPosts(current,older);
 assert.deepEqual(Array.from(merged,p=>p.id),[uuid(1),uuid(2),uuid(3)]);
 assert.equal(merged[1].body,'edited current row');
});

test('first channel page returns 100 visible posts and detects the extra sentinel',async()=>{
 const rows=Array.from({length:101},(_,i)=>post(i+1,timestampAt(i)));
 const {api,calls}=socialHarness(()=>response(rows));
 const page=await api.listChannelPostsPage('signed-jwt',CHANNEL);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-jwt');
 assert.equal(calls[0].options.headers.apikey,'public-test');
 assert.equal(calls[0].options.cache,'no-store');
 assert.equal(page.posts.length,100);
 assert.equal(page.posts[0].id,rows[0].id);
 assert.equal(page.posts[99].id,rows[99].id);
 assert.equal(page.posts.some(item=>item.id===rows[100].id),false);
 assert.equal(page.hasMore,true);
});

test('exactly 100 channel posts do not show a false older-page affordance',async()=>{
 const rows=Array.from({length:100},(_,i)=>post(i+1,timestampAt(i)));
 const {api}=socialHarness(()=>response(rows));
 const page=await api.listChannelPostsPage('jwt',CHANNEL);
 assert.equal(page.posts.length,100);
 assert.equal(page.hasMore,false);
});

test('the next keyset page starts at the previous sentinel without skipping posts',async()=>{
 const firstRows=Array.from({length:101},(_,i)=>post(i+1,timestampAt(i)));
 const secondRows=[firstRows[100],...Array.from({length:9},(_,i)=>post(102+i,new Date(Date.parse(firstRows[100].created_at)-(i+1)*1000).toISOString()))];
 const {api,calls}=socialHarness((_url,_options,n)=>response(n===1?firstRows:secondRows));
 const first=await api.listChannelPostsPage('jwt',CHANNEL);
 const second=await api.listChannelPostsPage('jwt',CHANNEL,first.posts.at(-1));
 assert.equal(second.posts[0].id,firstRows[100].id);
 assert.equal(second.posts.length,10);
 assert.equal(second.hasMore,false);
 const cursorUrl=new URL(calls[1].url);
 assert.ok(cursorUrl.searchParams.get('or').includes('id.lt.'+first.posts.at(-1).id));
 const merged=pagination.appendOlderChannelPosts(first.posts,second.posts);
 assert.equal(merged.length,110);
 assert.equal(merged[100].id,firstRows[100].id);
});

test('unexpected rows from another channel are never exposed',async()=>{
 const {api}=socialHarness(()=>response([post(1),post(2,'2026-11-10T09:00:00Z',OTHER)]));
 const page=await api.listChannelPostsPage('jwt',CHANNEL);
 assert.deepEqual(Array.from(page.posts,p=>p.channel_id),[CHANNEL]);
 assert.equal(page.hasMore,false);
});

test('legacy listChannelPosts stays an array and exposes whether an older page exists',async()=>{
 const rows=Array.from({length:101},(_,i)=>post(i+1,timestampAt(i)));
 const {api}=socialHarness(()=>response(rows));
 const result=await api.listChannelPosts('jwt',CHANNEL);
 assert.equal(Array.isArray(result),true);
 assert.equal(result.length,100);
 assert.equal(result.hasMore,true);
});

test('ChannelsPanel scopes page requests, preserves current rows and exposes retryable pagination',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/listChannelPosts\(token,channel\.id\)/);
 assert.match(panel,/listChannelPostsPage\(token,channel\.id,oldest\)/);
 assert.match(panel,/appendOlderChannelPosts\(posts,page\.posts\)/);
 assert.match(panel,/listPostReactions\(token,page\.posts\.map\(p=>p\.id\)\)/);
 assert.match(panel,/postsReloadingRef\.current\|\|olderPostsLoadingRef\.current/);
 assert.match(panel,/olderPostsRequestGuard\.invalidate\(\)/);
 assert.match(panel,/Показать более ранние публикации/);
 assert.match(panel,/olderPostsError&&/);
 assert.match(panel,/channelScopeRef\.current\.channelId===channel\.id/);
});
