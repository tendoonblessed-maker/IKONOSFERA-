import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';

const CHAT='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const ATTEMPT='44444444-4444-4444-8444-444444444444';
const ROW_ID='55555555-5555-4555-8555-555555555555';
const BASE='https://unit-test.invalid';
const file=(bytes=[1,2,3,4],name='photo.png')=>({
 type:'image/png',size:bytes.length,name,lastModified:123456,
 arrayBuffer:async()=>Uint8Array.from(bytes).buffer
});
const ok=data=>({ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data});
const bad=(status,message)=>({ok:false,status,text:async()=>JSON.stringify({message}),json:async()=>({message})});

function compile(source){
 return ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
}
function loadAttempts({blocked=false}={}){
 const source=readFileSync(new URL('../lib/direct-media-attempts.ts',import.meta.url),'utf8');
 const exports={},store=new Map();
 const sessionStorage={
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,value),
  removeItem:key=>store.delete(key),
  key:index=>Array.from(store.keys())[index]??null,
  get length(){return store.size;}
 };
 const window=blocked?Object.defineProperty({},'sessionStorage',{get(){throw Error('storage blocked');}}):{sessionStorage};
 vm.runInNewContext(compile(source),{
  exports,crypto:webcrypto,TextEncoder,window
 },{filename:'direct-media-attempts.cjs',timeout:2000});
 return {api:exports,store};
}
function loadSupabase(fetchHandler){
 const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
 const exports={},calls=[];
 vm.runInNewContext(compile(source),{
  exports,crypto:webcrypto,AbortSignal,
  process:{env:{
   NEXT_PUBLIC_SUPABASE_URL:BASE,
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'
  }},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return fetchHandler(url,options,calls.length);
  }
 },{filename:'supabase-rest.cjs',timeout:3000});
 return {api:exports,calls};
}
function saved(body){
 return {
  id:ROW_ID,chat_id:CHAT,sender_id:OWNER,body,
  created_at:'2026-11-06T03:00:00Z',
  media_path:CHAT+'/'+OWNER+'/'+ATTEMPT+'.png',
  media_type:'image',read_at:null,reply_to_message_id:null,
  client_message_id:ATTEMPT
 };
}

test('same file bytes and caption reuse one ID; changed bytes or caption get new IDs',async()=>{
 const {api}=loadAttempts();
 const first=await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Подпись');
 const same=await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Подпись');
 const changedCaption=await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Другая подпись');
 const changedBytes=await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file([9,8,7,6]),'Подпись');
 assert.equal(same,first);
 assert.notEqual(changedCaption,first);
 assert.notEqual(changedBytes,first);
});

test('concurrent submits for the same file and caption share one attempt UUID',async()=>{
 const {api}=loadAttempts();
 const [first,second,third]=await Promise.all([
  api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Same caption'),
  api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Same caption'),
  api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Same caption')
 ]);
 assert.equal(first,second);
 assert.equal(second,third);
 assert.equal(api.readDirectMediaAttempts(OWNER,CHAT).length,1);
});

test('attempt identity is isolated by account and chat and storage contains no file bytes or caption',async()=>{
 const {api,store}=loadAttempts();
 const id=await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Секретная подпись');
 const otherAccount=await api.getOrCreateDirectMediaAttempt(OTHER,CHAT,file(),'Секретная подпись');
 const otherChat=await api.getOrCreateDirectMediaAttempt(OWNER,ROW_ID,file(),'Секретная подпись');
 assert.notEqual(id,otherAccount);
 assert.notEqual(id,otherChat);
 const raw=Array.from(store.values()).join('');
 assert.ok(!raw.includes('Секретная подпись'));
 assert.ok(!raw.includes('1,2,3,4'));
 assert.ok(!raw.includes('public-test-key'));
 assert.match(raw,/fingerprint/);
});

test('clearing one acknowledgment keeps other attempts; explicit account cleanup stays scoped',async()=>{
 const {api}=loadAttempts();
 const first=await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'A');
 const second=await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'B');
 const other=await api.getOrCreateDirectMediaAttempt(OTHER,CHAT,file(),'A');
 api.clearDirectMediaAttempt(OWNER,CHAT,first);
 const remaining=api.readDirectMediaAttempts(OWNER,CHAT);
 assert.equal(remaining.length,1);
 assert.equal(remaining[0].id,second);
 api.clearAllDirectMediaAttempts(OWNER);
 assert.equal(api.readDirectMediaAttempts(OWNER,CHAT).length,0);
 assert.equal(api.readDirectMediaAttempts(OTHER,CHAT)[0].id,other);
});

test('many unresolved attempts are retained instead of silently evicting an older retry ID',async()=>{
 const {api}=loadAttempts();
 const ids=[];
 for(let index=0;index<10;index++)
  ids.push(await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Caption '+index));
 const records=api.readDirectMediaAttempts(OWNER,CHAT);
 assert.equal(records.length,10);
 assert.ok(records.some(item=>item.id===ids[0]));
 assert.ok(records.some(item=>item.id===ids[9]));
});

test('expired and malformed attempts are discarded; blocked sessionStorage has an in-memory fallback',async()=>{
 const {api,store}=loadAttempts();
 const now=Date.now();
 await api.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'TTL',now);
 assert.equal(api.readDirectMediaAttempts(OWNER,CHAT,now+api.DIRECT_MEDIA_ATTEMPT_TTL_MS+1).length,0);
 store.set('ikonosfera-direct-media-attempt-v1:'+OWNER+':'+CHAT,'{bad json');
 assert.equal(api.readDirectMediaAttempts(OWNER,CHAT).length,0);
 const fallback=loadAttempts({blocked:true}).api;
 const first=await fallback.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Fallback');
 const again=await fallback.getOrCreateDirectMediaAttempt(OWNER,CHAT,file(),'Fallback');
 assert.equal(again,first);
 fallback.clearDirectMediaAttempt(OWNER,CHAT,first);
 assert.equal(fallback.readDirectMediaAttempts(OWNER,CHAT).length,0);
});

test('direct media upload path and message row use the stable client UUID',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/'))return ok({});
  if(url.includes('/rest/v1/messages')&&options.method==='POST'){
   const body=JSON.parse(options.body);
   return ok([saved(body.body)]);
  }
  throw Error('Unexpected request '+url);
 });
 const result=await api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT);
 assert.equal(result.client_message_id,ATTEMPT);
 assert.equal(calls.length,2);
 assert.ok(calls[0].url.endsWith('/'+CHAT+'/'+OWNER+'/'+ATTEMPT+'.png'));
 assert.equal(calls[0].options.headers['x-upsert'],'false');
 const post=calls[1];
 assert.equal(post.options.method,'POST');
 assert.equal(post.options.headers.Authorization,'Bearer jwt');
 assert.equal(post.options.headers.Prefer,'return=representation');
 assert.deepEqual(JSON.parse(post.options.body),{
  chat_id:CHAT,sender_id:OWNER,body:'Подпись',
  media_path:CHAT+'/'+OWNER+'/'+ATTEMPT+'.png',
  media_type:'image',client_message_id:ATTEMPT
 });
});

test('lost upload acknowledgment is recovered by signing the deterministic private object path',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/')&&options.method==='POST')
   throw Error('upload committed but response was lost');
  if(url.includes('/storage/v1/object/sign/ikonosfera-direct-media/'))
   return ok({signedURL:'/object/sign/ikonosfera-direct-media/'+CHAT+'/'+OWNER+'/'+ATTEMPT+'.png'});
  if(url.includes('/rest/v1/messages')&&options.method==='POST')
   return ok([saved(JSON.parse(options.body).body)]);
  throw Error('Unexpected request '+url);
 });
 const result=await api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT);
 assert.equal(result.media_path,CHAT+'/'+OWNER+'/'+ATTEMPT+'.png');
 assert.equal(calls.filter(c=>c.url.includes('/storage/v1/object/ikonosfera-direct-media/')).length,1);
 assert.equal(calls.filter(c=>c.options.method==='POST'&&c.url.includes('/rest/v1/messages')).length,1);
 assert.equal(calls.filter(c=>c.url.includes('/storage/v1/object/sign/')).length,1);
});

test('lost message INSERT acknowledgment recovers exact row without a second INSERT or deleting media',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/'))return ok({});
  if(url.includes('/rest/v1/messages')&&options.method==='POST')
   throw Error('database committed; HTTP response lost');
  if(url.includes('/rest/v1/messages')&&options.method==='GET')
   return ok([saved('Подпись')]);
  if(options.method==='DELETE')return ok({});
  throw Error('Unexpected request '+url);
 });
 const result=await api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT);
 assert.equal(result.id,ROW_ID);
 assert.equal(calls.filter(c=>c.options.method==='POST'&&c.url.includes('/rest/v1/messages')).length,1);
 assert.equal(calls.filter(c=>c.options.method==='GET'&&c.url.includes('/rest/v1/messages')).length,1);
 assert.equal(calls.filter(c=>c.options.method==='DELETE').length,0);
 assert.ok(calls.some(c=>c.url.includes('chat_id=eq.'+CHAT)));
 assert.ok(calls.some(c=>c.url.includes('sender_id=eq.'+OWNER)));
 assert.ok(calls.some(c=>c.url.includes('client_message_id=eq.'+ATTEMPT)));
});

test('ambiguous failure with no visible row keeps the uploaded object for manual retry',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/'))return ok({});
  if(url.includes('/rest/v1/messages')&&options.method==='POST')throw Error('timeout');
  if(url.includes('/rest/v1/messages')&&options.method==='GET')return ok([]);
  if(options.method==='DELETE')return ok({});
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT),/Файл сохранён — повтори вручную/);
 assert.equal(calls.filter(c=>c.options.method==='POST'&&c.url.includes('/rest/v1/messages')).length,1);
 assert.equal(calls.filter(c=>c.options.method==='DELETE').length,0);
});

test('definite permission rejection deletes object only after a successful empty read-back',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/'))return ok({});
  if(url.includes('/rest/v1/messages')&&options.method==='POST')return bad(403,'Access denied');
  if(url.includes('/rest/v1/messages')&&options.method==='GET')return ok([]);
  if(options.method==='DELETE')return ok({});
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT),/Access denied/);
 assert.equal(calls.filter(c=>c.options.method==='DELETE').length,1);
});

test('a mismatched row is never accepted or deleted as the requested attachment',async()=>{
 const wrong={...saved('Подпись'),media_path:CHAT+'/'+OWNER+'/99999999-9999-4999-8999-999999999999.png'};
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/'))return ok({});
  if(url.includes('/rest/v1/messages')&&options.method==='POST')throw Error('timeout');
  if(url.includes('/rest/v1/messages')&&options.method==='GET')return ok([wrong]);
  if(options.method==='DELETE')return ok({});
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT),/другое вложение/);
 assert.equal(calls.filter(c=>c.options.method==='DELETE').length,0);
});


test('concurrent sends for one account, chat and attempt share a single upload and INSERT',async()=>{
 let releaseUpload;
 const uploadGate=new Promise(resolve=>{releaseUpload=resolve;});
 const {api,calls}=loadSupabase(async(url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/')&&options.method==='POST'){
   await uploadGate;
   return ok({});
  }
  if(url.includes('/rest/v1/messages')&&options.method==='POST'){
   const body=JSON.parse(options.body);
   return ok([saved(body.body)]);
  }
  throw Error('Unexpected request '+url);
 });
 const first=api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT);
 const second=api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT);
 const uploads=()=>calls.filter(call=>call.url.includes('/storage/v1/object/ikonosfera-direct-media/')&&call.options.method==='POST').length;
 assert.equal(uploads(),1);
 releaseUpload();
 const [a,b]=await Promise.all([first,second]);
 assert.equal(a.id,ROW_ID);
 assert.equal(b.id,ROW_ID);
 assert.equal(uploads(),1);
 assert.equal(calls.filter(call=>call.url.includes('/rest/v1/messages')&&call.options.method==='POST').length,1);
});

test('different accounts or chats never share an in-flight media send',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/'))return ok({});
  if(url.includes('/rest/v1/messages')&&options.method==='POST'){
   const body=JSON.parse(options.body);
   return ok([{
    id:ROW_ID,chat_id:body.chat_id,sender_id:body.sender_id,body:body.body,
    created_at:'2026-11-06T03:00:00Z',media_path:body.media_path,
    media_type:'image',read_at:null,reply_to_message_id:null,
    client_message_id:body.client_message_id
   }]);
  }
  throw Error('Unexpected request '+url);
 });
 const [sameChatOtherOwner,otherChatSameOwner]=await Promise.all([
  api.sendDirectMedia('jwt',CHAT,OTHER,file(),'Подпись',ATTEMPT),
  api.sendDirectMedia('jwt',ROW_ID,OWNER,file(),'Подпись',ATTEMPT)
 ]);
 assert.equal(sameChatOtherOwner.sender_id,OTHER);
 assert.equal(otherChatSameOwner.chat_id,ROW_ID);
 assert.equal(calls.filter(call=>call.url.includes('/storage/v1/object/ikonosfera-direct-media/')).length,2);
 assert.equal(calls.filter(call=>call.url.includes('/rest/v1/messages')&&call.options.method==='POST').length,2);
});

test('a failed in-flight media send releases its slot for an explicit retry',async()=>{
 let uploadAttempts=0;
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/storage/v1/object/ikonosfera-direct-media/')&&options.method==='POST'){
   uploadAttempts++;
   if(uploadAttempts===1)throw Error('temporary upload failure');
   return ok({});
  }
  if(url.includes('/storage/v1/object/sign/ikonosfera-direct-media/'))return bad(404,'not found');
  if(url.includes('/rest/v1/messages')&&options.method==='POST')return ok([saved('Подпись')]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT),/temporary upload failure/);
 const sent=await api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись',ATTEMPT);
 assert.equal(sent.id,ROW_ID);
 assert.equal(uploadAttempts,2);
 assert.equal(calls.filter(call=>call.url.includes('/rest/v1/messages')&&call.options.method==='POST').length,1);
});

test('invalid account, chat or attempt UUID is rejected before any upload',async()=>{
 const {api,calls}=loadSupabase(()=>{throw Error('network must not be used');});
 await assert.rejects(api.sendDirectMedia('jwt','bad',OWNER,file(),'Подпись',ATTEMPT),/Некорректные параметры/);
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,file(),'Подпись','bad'),/Некорректные параметры/);
 assert.equal(calls.length,0);
});
