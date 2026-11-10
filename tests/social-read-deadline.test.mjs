import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {SOCIAL_READ_TIMEOUT_MS,withSocialReadDeadline} from '../lib/social-read-deadline.mjs';

const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const success=data=>({ok:true,status:200,json:async()=>data});

function setup(fetchHandler,timeoutMs=25){
 const exports={};
 const calls=[];
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-anon-test'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return fetchHandler(url,options,calls.length);
  },
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://unit-test.invalid'};
   if(name==='@/lib/social-read-deadline.mjs')return {
    withSocialReadDeadline:operation=>withSocialReadDeadline(operation,timeoutMs)
   };
   if(name==='@/lib/media-object-path')return {deleteMediaObject:async()=>{}};
   if(name==='@/lib/channel-post-pagination')return {
    CHANNEL_POST_PAGE_SIZE:50,channelPostsPagePath:()=>'/rest/v1/channel_posts'
   };
   if(name==='@/lib/channel-comment-pagination')return {
    CHANNEL_COMMENT_PAGE_SIZE:50,channelCommentsPagePath:()=>'/rest/v1/channel_comments'
   };
   throw new Error('Unexpected module: '+name);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2500,filename:'social.cjs'});
 return {api:exports,calls};
}

test('social read deadline is a portable 18-second AbortController timeout',()=>{
 assert.equal(SOCIAL_READ_TIMEOUT_MS,18_000);
 const helper=readFileSync(new URL('../lib/social-read-deadline.mjs',import.meta.url),'utf8');
 assert.match(helper,/new AbortController\(\)/);
 assert.doesNotMatch(helper,/AbortSignal\.timeout/);
});

test('successful social reads clear their deadline timer',async()=>{
 let signal;
 const result=await withSocialReadDeadline(async current=>{
  signal=current;
  return {ok:true};
 },5);
 assert.deepEqual(result,{ok:true});
 await delay(15);
 assert.equal(signal.aborted,false);
});

test('a stalled social read is aborted and reports a readable timeout',async()=>{
 let signal;
 const pending=withSocialReadDeadline(current=>new Promise((_,reject)=>{
  signal=current;
  current.addEventListener('abort',()=>reject(new Error('fetch aborted')),{once:true});
 }),5);
 await assert.rejects(pending,error=>error.name==='TimeoutError'&&/Сервер социальных данных не ответил вовремя/.test(error.message));
 assert.equal(signal.aborted,true);
});

test('late results are rejected even when an operation ignores the abort signal',async()=>{
 await assert.rejects(
  withSocialReadDeadline(()=>delay(15).then(()=>({stale:true})),5),
  error=>error.name==='TimeoutError'
 );
});

test('ordinary social network errors are preserved and do not become timeout errors',async()=>{
 const networkError=new TypeError('offline');
 let signal;
 await assert.rejects(
  withSocialReadDeadline(current=>{signal=current;throw networkError;},50),
  error=>error===networkError
 );
 await delay(60);
 assert.equal(signal.aborted,false);
});

test('social GET requests carry the deadline signal and preserve JWT/no-store',async()=>{
 const {api,calls}=setup(()=>success([]));
 assert.deepEqual(await api.listChannels('signed-user-jwt'),[]);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.equal(calls[0].options.headers.apikey,'public-anon-test');
 assert.equal(calls[0].options.cache,'no-store');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('social write requests keep their existing acknowledgement semantics without an automatic timeout',async()=>{
 const channel={id:'11111111-1111-4111-8111-111111111111',owner_id:'22222222-2222-4222-8222-222222222222',title:'Channel',slug:'channel',description:'Description',discussion_enabled:false,created_at:'2026-11-10T00:00:00Z'};
 const {api,calls}=setup(()=>success([channel]));
 const result=await api.createChannel('signed-user-jwt',channel.owner_id,' Channel ','channel',' Description ');
 assert.equal(result.id,channel.id);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.signal,undefined);
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-user-jwt');
 assert.deepEqual(JSON.parse(calls[0].options.body),{
  owner_id:channel.owner_id,title:'Channel',slug:'channel',description:'Description'
 });
});

test('the read deadline covers response-body parsing, not only receipt of headers',async()=>{
 const {api,calls}=setup((_url,options)=>({
  ok:true,
  status:200,
  json:()=>new Promise((_,reject)=>{
   options.signal.addEventListener('abort',()=>reject(new Error('body stalled')),{once:true});
  })
 }),5);
 await assert.rejects(api.listChannels('signed-user-jwt'),error=>error.name==='TimeoutError');
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.signal.aborted,true);
});
