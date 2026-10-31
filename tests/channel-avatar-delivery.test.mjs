import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const ID='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const AVATAR=OWNER+'/99999999-9999-4999-8999-999999999999.jpg';
const channel=(avatar_path=AVATAR,extra={})=>({
 id:ID,owner_id:OWNER,title:'Тестовый канал',slug:'test_channel',
 description:'Новости',discussion_enabled:false,avatar_path,
 created_at:'2026-10-31T00:00:00Z',...extra
});
const ok=data=>({ok:true,status:200,json:async()=>data});
const rejected=(status,message)=>({ok:false,status,json:async()=>({message})});

function setup(handler){
 const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={},calls=[];
 const context={
  exports,
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit-test.invalid'};
  },
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key'}},
  AbortSignal,
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'social.cjs'});
 return {api:exports,calls};
}

test('successful owner PATCH returns canonical avatar and never makes a second request',async()=>{
 const {api,calls}=setup(()=>ok([channel()]));
 const updated=await api.updateChannelAvatar('jwt',ID,OWNER,AVATAR);
 assert.equal(updated.avatar_path,AVATAR);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'PATCH');
 assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
 assert.equal(calls[0].options.headers.Prefer,'return=representation');
 assert.equal(calls[0].options.signal instanceof AbortSignal,true);
 assert.deepEqual(JSON.parse(calls[0].options.body),{avatar_path:AVATAR});
 assert.ok(calls[0].url.includes('id=eq.'+ID));
 assert.ok(calls[0].url.includes('owner_id=eq.'+OWNER));
});

test('PATCH commits then its response is lost: confirm through scoped GET, never delete',async()=>{
 const {api,calls}=setup((url,options)=>{
  if(options.method==='PATCH')throw Error('response lost after commit');
  return ok([channel()]);
 });
 const result=await api.updateChannelAvatar('jwt',ID,OWNER,AVATAR);
 assert.equal(result.avatar_path,AVATAR);
 assert.equal(calls.length,2);
 assert.equal(calls.filter(x=>x.options.method==='PATCH').length,1);
 assert.equal(calls[1].options.method,'GET');
 assert.equal(calls[1].options.signal instanceof AbortSignal,true);
 assert.ok(calls[1].url.includes('id=eq.'+ID));
 assert.ok(calls.every(x=>x.options.method!=='DELETE'));
});

test('PATCH timeout with stale GET rejects instead of falsely confirming avatar',async()=>{
 const old=OWNER+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
 const {api,calls}=setup((url,options)=>options.method==='PATCH'
  ?Promise.reject(Error('timeout')):ok([channel(old)]));
 await assert.rejects(api.updateChannelAvatar('jwt',ID,OWNER,AVATAR),/timeout/);
 assert.equal(calls.filter(x=>x.options.method==='PATCH').length,1);
 assert.ok(calls.every(x=>x.options.method!=='DELETE'));
});

test('empty PATCH response can still represent a committed update',async()=>{
 const {api,calls}=setup((url,options)=>options.method==='PATCH'?ok([]):ok([channel()]));
 const result=await api.updateChannelAvatar('jwt',ID,OWNER,AVATAR);
 assert.equal(result.id,ID);
 assert.equal(calls.length,2);
});

test('a mismatched PATCH response only succeeds if the scoped read confirms requested state',async()=>{
 const unexpected=channel(OWNER+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg');
 const {api,calls}=setup((url,options)=>options.method==='PATCH'?ok([unexpected]):ok([channel()]));
 const result=await api.updateChannelAvatar('jwt',ID,OWNER,AVATAR);
 assert.equal(result.avatar_path,AVATAR);
 assert.equal(calls.length,2);
});

test('never accept a row for another owner or channel, even after lost response',async()=>{
 for(const badRow of [channel(AVATAR,{owner_id:OTHER}),channel(AVATAR,{id:OTHER})]){
  const {api,calls}=setup((url,options)=>options.method==='PATCH'?ok([]):ok([badRow]));
  await assert.rejects(api.updateChannelAvatar('jwt',ID,OWNER,AVATAR),/Сервер вернул другую аватарку/);
  assert.equal(calls.length,2);
 }
});

test('a denied PATCH with inaccessible row remains an error',async()=>{
 const {api,calls}=setup((url,options)=>options.method==='PATCH'
  ?rejected(403,'Permission denied'):rejected(403,'not allowed'));
 await assert.rejects(api.updateChannelAvatar('jwt',ID,OWNER,AVATAR),/Permission denied/);
 assert.equal(calls.length,2);
});

test('invalid owner, channel, image type and cross-account paths fail before any request',async()=>{
 const {api,calls}=setup(()=>{throw Error('must not call network')});
 await assert.rejects(api.updateChannelAvatar('jwt','invalid',OWNER,AVATAR),/Некорректные параметры/);
 await assert.rejects(api.updateChannelAvatar('jwt',ID,OWNER,OTHER+'/photo.jpg'),/Некорректные параметры/);
 await assert.rejects(api.updateChannelAvatar('jwt',ID,OWNER,OWNER+'/video.mp4'),/Некорректные параметры/);
 await assert.rejects(api.updateChannelAvatar('jwt',ID,OWNER,OWNER+'/file.svg'),/Некорректные параметры/);
 assert.equal(calls.length,0);
});

test('explicit avatar removal uses null, with matching canonical response',async()=>{
 const {api,calls}=setup(()=>ok([channel(null)]));
 const result=await api.updateChannelAvatar('jwt',ID,OWNER,null);
 assert.equal(result.avatar_path,null);
 assert.equal(calls.length,1);
 assert.deepEqual(JSON.parse(calls[0].options.body),{avatar_path:null});
});

test('channel component never deletes uploaded avatar after uncertain PATCH failure',()=>{
 const source=readFileSync(new URL('../components/ChannelsPanel.tsx',import.meta.url),'utf8');
 const start=source.indexOf('async function changeChannelAvatar(');
 const end=source.indexOf('async function saveSettings(',start);
 assert.ok(start>=0&&end>start);
 const update=source.slice(start,end);
 assert.match(update,/const updated=await updateChannelAvatar\(token,currentChannel\.id,userId,uploaded\.path\)/);
 assert.doesNotMatch(update,/removeUpload\(/);
 assert.match(source,/\{imageUrl\(currentChannel\.avatar_path\)\?<img/);
 assert.match(source,/\{currentChannel\.description&&<p className="channel-description"/);
});
