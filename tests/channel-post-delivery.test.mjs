import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const OWNER='11111111-1111-4111-8111-111111111111';
const CHANNEL='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const POSTED='44444444-4444-4444-8444-444444444444';
const file=()=>({type:'image/png',size:123,name:'picture.png'});
const ok=data=>({ok:true,status:200,json:async()=>data});
const bad=(status,message)=>({ok:false,status,json:async()=>({message})});
const isUpload=call=>call.url.includes('/storage/v1/object/ikonosfera-media/')&&call.options.method==='POST';
const isPost=call=>call.url.includes('/rest/v1/channel_posts')&&call.options.method==='POST';
const isRead=call=>call.url.includes('/rest/v1/channel_posts')&&call.options.method==='GET';
const body=call=>JSON.parse(call.options.body);
const saved=(payload,overrides={})=>({
 id:POSTED,author_id:OWNER,channel_id:CHANNEL,body:payload.body,
 image_path:payload.image_path,attachment_path:payload.attachment_path,
 attachment_type:payload.attachment_type,created_at:'2026-10-31T00:00:00Z',...overrides
});

function setup(handler){
 const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={},calls=[];
 const context={
  exports,crypto:{randomUUID},AbortSignal,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  require(name){assert.equal(name,'@/lib/supabase-rest');return {apiUrl:'https://test.invalid'};},
  fetch:async(url,options)=>{
   const call={url,options};calls.push(call);
   return handler(call,calls);
  }
 };
 vm.runInNewContext(compiled,context,{filename:'social.cjs',timeout:3000});
 return {api:exports,calls};
}

test('normal file post uploads one object and inserts one canonical row',async()=>{
 const photo=file();let posted;
 const {api,calls}=setup((call)=>{
  if(isUpload(call))return ok({});
  if(isPost(call)){posted=body(call);return ok([saved(posted)]);}
  throw Error('Unexpected request: '+call.url);
 });
 const result=await api.publishChannelPostSafely('token',OWNER,CHANNEL,'  Привет  ',photo);
 assert.equal(result.id,POSTED);
 assert.equal(result.body,'Привет');
 assert.equal(calls.filter(isUpload).length,1);
 assert.equal(calls.filter(isPost).length,1);
 assert.equal(calls.filter(isRead).length,0);
 assert.equal(calls.filter(call=>call.options.method==='DELETE').length,0);
 assert.equal(posted.author_id,OWNER);
 assert.equal(posted.channel_id,CHANNEL);
 assert.equal(posted.image_path,null);
 assert.equal(posted.attachment_type,'image');
 assert.ok(posted.attachment_path.startsWith(OWNER+'/'));
 assert.equal(calls.find(isPost).options.headers.Prefer,'return=representation');
 assert.equal(calls.find(isPost).options.headers.Authorization,'Bearer token');
});

test('lost HTTP acknowledgment after DB commit recovers via exact-path read-only lookup',async()=>{
 let posted;
 const {api,calls}=setup((call)=>{
  if(isUpload(call))return ok({});
  if(isPost(call)){posted=body(call);throw Error('network lost after commit');}
  if(isRead(call))return ok([saved(posted)]);
  throw Error('Unexpected request: '+call.url);
 });
 const result=await api.publishChannelPostSafely('token',OWNER,CHANNEL,'Caption',file());
 assert.equal(result.attachment_path,posted.attachment_path);
 assert.equal(calls.filter(isUpload).length,1);
 assert.equal(calls.filter(isPost).length,1);
 assert.equal(calls.filter(isRead).length,1);
 const get=calls.find(isRead);
 assert.ok(get.url.includes('author_id=eq.'+OWNER));
 assert.ok(get.url.includes('channel_id=eq.'+CHANNEL));
 assert.ok(get.url.includes('attachment_path=eq.'+encodeURIComponent(posted.attachment_path)));
 assert.equal(get.options.headers.Authorization,'Bearer token');
 assert.equal(get.options.signal instanceof AbortSignal,true);
 assert.equal(calls.filter(call=>call.options.method==='DELETE').length,0);
});

test('manual retry of uncertain send checks only and cannot duplicate POST or upload',async()=>{
 let posted,reads=0;
 const {api,calls}=setup((call)=>{
  if(isUpload(call))return ok({});
  if(isPost(call)){posted=body(call);throw Error('request timed out');}
  if(isRead(call)){
   reads++;
   return ok(reads===3?[saved(posted)]:[]);
  }
  throw Error('Unexpected request: '+call.url);
 });
 const photo=file();
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Body',photo),/Публикация не подтверждена/);
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Body',photo),/предыдущую публикацию/);
 const result=await api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Body',photo);
 assert.equal(result.id,POSTED);
 assert.equal(calls.filter(isUpload).length,1);
 assert.equal(calls.filter(isPost).length,1);
 assert.equal(calls.filter(isRead).length,3);
 assert.equal(calls.filter(call=>call.options.method==='DELETE').length,0);
});

test('server row mismatch is never incorrectly acknowledged',async()=>{
 for(const mismatch of [
  {author_id:OTHER},{channel_id:OTHER},{body:'different'},
  {attachment_type:'audio'},{attachment_path:OWNER+'/'+randomUUID()+'.png'},{image_path:OWNER+'/'+randomUUID()+'.jpg'}
 ]){
  const {api,calls}=setup((call)=>{
   if(isUpload(call))return ok({});
   if(isPost(call))return ok([saved(body(call),mismatch)]);
   if(isRead(call))return ok([]);
   throw Error('Unexpected request');
  });
  await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Hello',file()),/не подтверждена/);
  assert.equal(calls.filter(isPost).length,1);
  assert.equal(calls.filter(call=>call.options.method==='DELETE').length,0);
 }
});

test('mismatching lookup is a hard failure: do not trust another post using same path',async()=>{
 let posted;
 const {api,calls}=setup((call)=>{
  if(isUpload(call))return ok({});
  if(isPost(call)){posted=body(call);throw Error('timeout');}
  if(isRead(call))return ok([saved(posted,{body:'different'})]);
  throw Error('Unexpected request');
 });
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Original',file()),/с другими данными/);
 assert.equal(calls.filter(isPost).length,1);
});

test('multiple matching rows from backend never count as one verified insert',async()=>{
 let posted;
 const {api,calls}=setup((call)=>{
  if(isUpload(call))return ok({});
  if(isPost(call)){posted=body(call);throw Error('timeout');}
  if(isRead(call))return ok([saved(posted),saved(posted,{id:randomUUID()})]);
  throw Error('Unexpected request');
 });
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Hello',file()),/несколько публикаций/);
 assert.equal(calls.filter(call=>call.options.method==='DELETE').length,0);
});

test('failed status 403 never silently retries without a new File instance',async()=>{
 const photo=file();
 const {api,calls}=setup((call)=>{
  if(isUpload(call))return ok({});
  if(isPost(call))return bad(403,'Access denied');
  if(isRead(call))return ok([]);
  throw Error('Unexpected request');
 });
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Hello',photo),/не подтверждена/);
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Hello',photo),/предыдущую публикацию/);
 assert.equal(calls.filter(isPost).length,1);
 assert.equal(calls.filter(isUpload).length,1);
});

test('file-only posts fail before upload because active DB constraint requires body',async()=>{
 const {api,calls}=setup(()=>{throw Error('no network expected')});
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'  ',file()),/Добавь текст/);
 await assert.rejects(api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'',null),/Добавь текст/);
 assert.equal(calls.length,0);
});

test('text-only post still uses normal POST without upload',async()=>{
 const {api,calls}=setup((call)=>{
  if(isPost(call))return ok([saved(body(call),{attachment_path:null,attachment_type:null})]);
  throw Error('Unexpected request');
 });
 const result=await api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'Text only',null);
 assert.equal(result.body,'Text only');
 assert.equal(calls.filter(isUpload).length,0);
 assert.equal(calls.filter(isPost).length,1);
});

test('changing caption creates a separate attempt only after user explicitly edits',async()=>{
 const photo=file(),paths=[];
 const {api,calls}=setup((call)=>{
  if(isUpload(call))return ok({});
  if(isPost(call)){paths.push(body(call).attachment_path);return ok([saved(body(call))]);}
  throw Error('Unexpected request');
 });
 await api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'A',photo);
 await api.publishChannelPostSafely('jwt',OWNER,CHANNEL,'B',photo);
 assert.notEqual(paths[0],paths[1]);
 assert.equal(calls.filter(isUpload).length,2);
});

test('channel composer never deletes uncertain attachments or reports a failed refresh as send failure',()=>{
 const panel=readFileSync(new URL('../components/ChannelsPanel.tsx',import.meta.url),'utf8');
 const start=panel.indexOf('async function post(e:FormEvent)');
 const end=panel.indexOf('async function writeComment(e:FormEvent)',start);
 assert.ok(start>=0&&end>start);
 const action=panel.slice(start,end);
 assert.match(action,/publishChannelPostSafely\(token,userId,channel\.id,body,file\)/);
 assert.doesNotMatch(action,/removeUpload\(/);
 assert.ok(action.includes('setBody("");setFile(null);'));
 assert.match(action,/setPosts\(current=>\[published/);
 assert.match(action,/try\{await reload\(\);\}[\s\S]*?catch\{setNotice/);
 assert.match(action,/!body\.trim\(\)/);
});
