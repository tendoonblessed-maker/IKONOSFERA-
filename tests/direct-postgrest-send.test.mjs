import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const ID='11111111-1111-4111-8111-111111111111';
const CHAT='22222222-2222-4222-8222-222222222222';
const OWNER='33333333-3333-4333-8333-333333333333';
const REPLY='44444444-4444-4444-8444-444444444444';
const ROW={
 id:'55555555-5555-4555-8555-555555555555',chat_id:CHAT,
 sender_id:OWNER,client_message_id:ID,body:'Привет',reply_to_message_id:null,
 created_at:'2026-10-29T10:00:00Z',read_at:null,media_path:null,media_type:null
};
const success=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
const rejected=(status,message)=>({ok:false,status,text:async()=>JSON.stringify({message})});

function setup(handler){
 const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={},calls=[];
 const context={
  exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://unit-test.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  AbortSignal,fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  }
 };
 vm.runInNewContext(compiled,context,{filename:'supabase-rest.cjs',timeout:2000});
 return {api:exports,calls};
}

test('successful direct RPC returns canonical row, sends stable UUID once',async()=>{
 const {api,calls}=setup(()=>success(ROW));
 const sent=await api.postMessage('jwt',CHAT,OWNER,' Привет ',ID);
 assert.equal(sent.client_message_id,ID);
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.endsWith('/rest/v1/rpc/send_direct_message'));
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer jwt');
 assert.equal(calls[0].options.headers.apikey,'public-test-key');
 assert.deepEqual(JSON.parse(calls[0].options.body),{
  p_chat_id:CHAT,p_body:'Привет',p_client_message_id:ID
 });
});

test('lost RPC response recovered via read-only owner/chat/client UUID scoped RLS SELECT',async()=>{
 const {api,calls}=setup((url,options)=>{
  if(options.method==='POST')throw Error('response was lost');
  return success([ROW]);
 });
 const sent=await api.postMessage('jwt',CHAT,OWNER,'Привет',ID);
 assert.equal(sent.id,ROW.id);
 assert.equal(calls.length,2);
 assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
 const get=calls[1];
 assert.equal(get.options.method,'GET');
 assert.ok(get.url.includes('/rest/v1/messages?select='));
 assert.ok(get.url.includes('chat_id=eq.'+CHAT));
 assert.ok(get.url.includes('sender_id=eq.'+OWNER));
 assert.ok(get.url.includes('client_message_id=eq.'+ID));
 assert.ok(get.url.includes('&limit=1'));
 assert.equal(get.options.headers.Authorization,'Bearer jwt');
 assert.equal(get.options.cache,'no-store');
});

test('unconfirmed timeout never triggers a second POST or claims delivered',async()=>{
 const {api,calls}=setup((url,options)=>
  options.method==='POST'?Promise.reject(Error('timeout')):success([]));
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет',ID),/Не удалось подтвердить отправку/);
 assert.equal(calls.length,2);
 assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
});

test('permission and input failures are not disguised by read-after-write recovery',async()=>{
 const {api,calls}=setup(()=>rejected(403,'Not a participant'));
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет',ID),/Not a participant/);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
});

test('wrong sender, content, reply target and client id must never be acknowledged',async()=>{
 for(const wrong of [
  {...ROW,sender_id:'99999999-9999-4999-8999-999999999999'},
  {...ROW,chat_id:'99999999-9999-4999-8999-999999999999'},
  {...ROW,body:'Чужое сообщение'},
  {...ROW,client_message_id:'99999999-9999-4999-8999-999999999999'},
  {...ROW,reply_to_message_id:REPLY}
 ]){
  const {api}=setup(()=>success(wrong));
  await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет',ID),/именно этого сообщения/);
 }
});

test('mismatch on read back is a hard error, not a delivery confirmation',async()=>{
 const {api,calls}=setup((url,options)=>options.method==='POST'
  ?Promise.reject(Error('network failure')):success([{...ROW,body:'wrong'}]));
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет',ID),/именно этого сообщения/);
 assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
});

test('reply RPC retains exact parent and UUID on retry and verification',async()=>{
 const reply={...ROW,reply_to_message_id:REPLY};
 const {api,calls}=setup(()=>success(reply));
 const sent=await api.postMessage('jwt',CHAT,OWNER,'Привет',ID,REPLY);
 assert.equal(sent.reply_to_message_id,REPLY);
 assert.ok(calls[0].url.endsWith('/rest/v1/rpc/send_direct_reply'));
 assert.deepEqual(JSON.parse(calls[0].options.body),{
  p_chat_id:CHAT,p_body:'Привет',p_client_message_id:ID,p_reply_to_message_id:REPLY
 });
});

test('invalid UUIDs, empty text and overly long drafts fail before writing',async()=>{
 const {api,calls}=setup(()=>success(ROW));
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,' ',ID),/Некорректные параметры/);
 await assert.rejects(api.postMessage('jwt','bad',OWNER,'Привет',ID),/Некорректные параметры/);
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'Привет','bad'),/Некорректные параметры/);
 await assert.rejects(api.postMessage('jwt',CHAT,OWNER,'A'.repeat(4001),ID),/Некорректные параметры/);
 assert.equal(calls.length,0);
});
