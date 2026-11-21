import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';

const CHAT='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const REPLY='44444444-4444-4444-8444-444444444444';
const ATTEMPT='55555555-5555-4555-8555-555555555555';
const ROW_ID='66666666-6666-4666-8666-666666666666';
const BASE='https://unit-test.invalid';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function compile(text){
 return ts.transpileModule(text,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
}
function loadAttempts({store=new Map(),blocked=false}={}){
 const exports={};
 const sessionStorage={
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,value),
  removeItem:key=>store.delete(key),
  key:index=>Array.from(store.keys())[index]??null,
  get length(){return store.size;}
 };
 const window=blocked
  ?Object.defineProperty({},'sessionStorage',{get(){throw Error('storage blocked');}})
  :{sessionStorage};
 vm.runInNewContext(compile(source('lib/direct-message-attempts.ts')),{
  exports,crypto:webcrypto,TextEncoder,window
 },{filename:'direct-message-attempts.cjs',timeout:3000});
 return {api:exports,store};
}
const ok=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
const bad=(status,message)=>({ok:false,status,text:async()=>JSON.stringify({message})});
function loadSupabase(fetchHandler){
 const exports={},calls=[];
 vm.runInNewContext(compile(source('lib/supabase-rest.ts')),{
  exports,crypto:webcrypto,AbortSignal,fetch:async(url,options)=>{
   calls.push({url,options});
   return fetchHandler(url,options,calls.length);
  },
  process:{env:{
   NEXT_PUBLIC_SUPABASE_URL:BASE,
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'
  }}
 },{filename:'supabase-rest.cjs',timeout:3000});
 return {api:exports,calls};
}
function saved(body='Привет',replyToMessageId=null){
 return {
  id:ROW_ID,chat_id:CHAT,sender_id:OWNER,body,
  created_at:'2026-11-21T01:00:00Z',
  media_path:null,media_type:null,read_at:null,edited_at:null,
  deleted_for:[],deleted_for_everyone:false,
  reply_to_message_id:replyToMessageId,client_message_id:ATTEMPT
 };
}
const nextId=()=>webcrypto.randomUUID();

test('same text and reply reuse one ID across a simulated tab reload without persisting content',async()=>{
 const store=new Map();
 const first=loadAttempts({store});
 const id=await first.api.getOrCreateDirectTextAttempt(OWNER,CHAT,'  Секретное сообщение  ',null,nextId);
 const raw=Array.from(store.values()).join('');
 assert.ok(raw.includes(id));
 assert.ok(!raw.includes('Секретное сообщение'));
 assert.ok(!raw.includes('public-test-key'));
 assert.match(raw,/[a-f0-9]{64}/);

 const afterReload=loadAttempts({store});
 const retried=await afterReload.api.getOrCreateDirectTextAttempt(OWNER,CHAT,'Секретное сообщение',null,nextId);
 assert.equal(retried,id);
});

test('attempts are isolated by account, chat, body and reply target',async()=>{
 const {api}=loadAttempts();
 const base=await api.getOrCreateDirectTextAttempt(OWNER,CHAT,'Одинаковый текст',null,nextId);
 const otherAccount=await api.getOrCreateDirectTextAttempt(OTHER,CHAT,'Одинаковый текст',null,nextId);
 const otherChat=await api.getOrCreateDirectTextAttempt(OWNER,ROW_ID,'Одинаковый текст',null,nextId);
 const otherBody=await api.getOrCreateDirectTextAttempt(OWNER,CHAT,'Другой текст',null,nextId);
 const otherReply=await api.getOrCreateDirectTextAttempt(OWNER,CHAT,'Одинаковый текст',REPLY,nextId);
 assert.equal(new Set([base,otherAccount,otherChat,otherBody,otherReply]).size,5);
});

test('concurrent same-turn attempt creation coalesces to one UUID',async()=>{
 const {api}=loadAttempts();
 let created=0;
 const createId=()=>{created++;return nextId();};
 const ids=await Promise.all(Array.from({length:5},()=>api.getOrCreateDirectTextAttempt(
  OWNER,CHAT,'Параллельная отправка',null,createId
 )));
 assert.equal(new Set(ids).size,1);
 assert.equal(created,1);
 assert.equal(api.readDirectTextAttempts(OWNER,CHAT).length,1);
});

test('confirmed attempt is cleared so a later intentional identical message gets a new ID',async()=>{
 const {api}=loadAttempts();
 const first=await api.getOrCreateDirectTextAttempt(OWNER,CHAT,'Ещё раз',null,nextId);
 api.clearDirectTextAttempt(OWNER,CHAT,first);
 assert.equal(api.readDirectTextAttempts(OWNER,CHAT).length,0);
 const second=await api.getOrCreateDirectTextAttempt(OWNER,CHAT,'Ещё раз',null,nextId);
 assert.notEqual(second,first);
});

test('expired and malformed attempts are discarded; blocked sessionStorage keeps an in-memory retry',async()=>{
 const {api,store}=loadAttempts();
 const now=Date.now();
 await api.getOrCreateDirectTextAttempt(OWNER,CHAT,'TTL',null,nextId,now);
 assert.equal(api.readDirectTextAttempts(OWNER,CHAT,now+api.DIRECT_TEXT_ATTEMPT_TTL_MS+1).length,0);
 store.set('ikonosfera-direct-text-attempt-v1:'+OWNER+':'+CHAT,'{broken');
 assert.equal(api.readDirectTextAttempts(OWNER,CHAT).length,0);

 const fallback=loadAttempts({blocked:true}).api;
 const first=await fallback.getOrCreateDirectTextAttempt(OWNER,CHAT,'Fallback',null,nextId);
 const retry=await fallback.getOrCreateDirectTextAttempt(OWNER,CHAT,'Fallback',null,nextId);
 assert.equal(retry,first);
 fallback.clearDirectTextAttempt(OWNER,CHAT,first);
 assert.equal(fallback.readDirectTextAttempts(OWNER,CHAT).length,0);
});

test('unresolved attempts are not silently evicted when the per-chat cap is reached',async()=>{
 const {api}=loadAttempts();
 for(let index=0;index<api.DIRECT_TEXT_MAX_ATTEMPTS_PER_CHAT;index++){
  await api.getOrCreateDirectTextAttempt(OWNER,CHAT,'Message '+index,null,nextId);
 }
 await assert.rejects(
  api.getOrCreateDirectTextAttempt(OWNER,CHAT,'One more',null,nextId),
  /Слишком много неподтверждённых сообщений/
 );
 assert.equal(api.readDirectTextAttempts(OWNER,CHAT).length,api.DIRECT_TEXT_MAX_ATTEMPTS_PER_CHAT);
});

test('text RPC success sends the stable ID and avoids an unnecessary read-back',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_message')){
   const payload=JSON.parse(options.body);
   return ok({...saved(payload.p_body),client_message_id:payload.p_client_message_id});
  }
  throw Error('Unexpected request '+url);
 });
 const result=await api.postMessage('jwt',CHAT,OWNER,'Привет',ATTEMPT,null);
 assert.equal(result.id,ROW_ID);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
 assert.equal(calls[0].options.method,'POST');
 assert.deepEqual(JSON.parse(calls[0].options.body),{
  p_chat_id:CHAT,p_body:'Привет',p_client_message_id:ATTEMPT
 });
});

test('reply RPC uses the same stable ID and exact reply target',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_reply')){
   const payload=JSON.parse(options.body);
   return ok({...saved(payload.p_body,payload.p_reply_to_message_id),client_message_id:payload.p_client_message_id});
  }
  throw Error('Unexpected request '+url);
 });
 const result=await api.postMessage('jwt',CHAT,OWNER,'Ответ',ATTEMPT,REPLY);
 assert.equal(result.reply_to_message_id,REPLY);
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.endsWith('/rpc/send_direct_reply'));
 assert.deepEqual(JSON.parse(calls[0].options.body),{
  p_chat_id:CHAT,p_body:'Ответ',p_client_message_id:ATTEMPT,p_reply_to_message_id:REPLY
 });
});

test('lost RPC acknowledgment is recovered by one RLS-scoped read-back, never a second POST',async()=>{
 const row=saved('Привет');
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_message'))throw Error('server committed; response lost');
  if(url.includes('/rest/v1/messages?select='))return ok([row]);
  throw Error('Unexpected request '+url);
 });
 const result=await api.postMessage('jwt',CHAT,OWNER,'Привет',ATTEMPT,null);
 assert.equal(result.id,ROW_ID);
 assert.equal(calls.length,2);
 assert.equal(calls.filter(call=>call.options.method==='POST').length,1);
 const read=calls[1];
 assert.equal(read.options.method,'GET');
 assert.equal(read.options.headers.Authorization,'Bearer jwt');
 assert.ok(read.url.includes('chat_id=eq.'+CHAT));
 assert.ok(read.url.includes('sender_id=eq.'+OWNER));
 assert.ok(read.url.includes('client_message_id=eq.'+ATTEMPT));
 assert.ok(read.url.endsWith('&limit=2'));
});

test('a duplicate-key RPC response resolves to the existing exact message',async()=>{
 const row=saved('Привет');
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_message'))return bad(409,'duplicate client_message_id');
  if(url.includes('/rest/v1/messages?select='))return ok([row]);
  throw Error('Unexpected request '+url);
 });
 const result=await api.postMessage('jwt',CHAT,OWNER,'Привет',ATTEMPT,null);
 assert.equal(result.id,ROW_ID);
 assert.equal(calls.filter(call=>call.options.method==='POST').length,1);
 assert.equal(calls.filter(call=>call.options.method==='GET').length,1);
});

test('ambiguous send with no visible row keeps the attempt retryable and does not auto-post again',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_message'))throw Error('timeout');
  if(url.includes('/rest/v1/messages?select='))return ok([]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет',ATTEMPT,null),/Черновик сохранён/);
 assert.equal(calls.filter(call=>call.options.method==='POST').length,1);
 assert.equal(calls.filter(call=>call.options.method==='GET').length,1);
});

test('a mismatched or duplicate read-back is never accepted as this message',async()=>{
 const wrong=saved('Другой текст');
 const {api}=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_message'))throw Error('timeout');
  if(url.includes('/rest/v1/messages?select='))return ok([wrong]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет',ATTEMPT,null),/Сервер вернул другое сообщение/);

 const duplicates=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_message'))throw Error('timeout');
  if(url.includes('/rest/v1/messages?select='))return ok([saved('Привет'),saved('Привет')]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(duplicates.api.postMessage('jwt',CHAT,OWNER,'Привет',ATTEMPT,null),/несколько записей/);
});

test('definite RLS rejection is preserved when read-back confirms no row',async()=>{
 const {api,calls}=loadSupabase((url,options)=>{
  if(url.includes('/rpc/send_direct_message'))return bad(403,'Access denied');
  if(url.includes('/rest/v1/messages?select='))return ok([]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет',ATTEMPT,null),/Access denied/);
 assert.equal(calls.filter(call=>call.options.method==='POST').length,1);
});

test('AppShell obtains the persistent attempt before RPC and clears only after confirmation',()=>{
 const shell=source('components/AppShell.tsx');
 const start=shell.indexOf('async function sendMessage(');
 const end=shell.indexOf('async function toggleSavedContact(',start);
 assert.ok(start>=0&&end>start);
 const send=shell.slice(start,end);
 const attempt=send.indexOf('await getOrCreateDirectTextAttempt(');
 const generationGuard=send.indexOf('if(draftGenerationRef.current!==submittedDraftGeneration||draftsOwnerRef.current!==accountId)return;');
 const post=send.indexOf('await postMessage(');
 const clear=send.indexOf('clearDirectTextAttempt(');
 assert.ok(attempt>=0&&generationGuard>attempt&&post>generationGuard&&clear>post,
  'a logout/account switch during fingerprinting must stop the POST before it starts');
 assert.match(send,/getOrCreateDirectTextAttempt\(accountId,chatId,plainText,reply\?\.id\?\?null,createSecureUuid\)/);
 assert.match(send,/postMessage\(token,chatId,accountId,plainText,attemptId,reply\?\.id\?\?null\)/);
});
