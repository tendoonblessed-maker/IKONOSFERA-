import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const UUID='44444444-4444-4444-8444-444444444444';

function loadHelper(fetchImpl,timers={}){
 const source=read('lib/channel-attachment-timeout.ts');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 const context={exports,fetch:fetchImpl,AbortController,
  setTimeout:timers.setTimeout??setTimeout,clearTimeout:timers.clearTimeout??clearTimeout};
 vm.runInNewContext(compiled,context,{filename:'channel-attachment-timeout.cjs',timeout:2500});
 return exports;
}

function loadSocial(fetchImpl,helper){
 const source=read('lib/social.ts');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={},calls=[];
 const helperProxy={...helper,fetchWithTimeout:(input,init,timeoutMs)=>{
  calls.push({input,init,timeoutMs});
  return helper.fetchWithTimeout(input,init,timeoutMs);
 }};
 const context={exports,process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon'}},
  crypto:{randomUUID:()=>UUID},fetch:fetchImpl,
  require(name){
   if(name==='@/lib/supabase-rest')return {apiUrl:'https://storage.test'};
   if(name==='./channel-attachment-timeout')return helperProxy;
   throw Error('Unexpected import: '+name);
  }};
 vm.runInNewContext(compiled,context,{filename:'social.cjs',timeout:2500});
 return {api:exports,calls};
}

test('portable deadline preserves the request and clears its timer after success',async()=>{
 const received=[];
 let created=0,cleared=0,delay=0;
 const helper=loadHelper(async(input,init)=>{received.push({input,init});return {ok:true};},{
  setTimeout:(fn,ms)=>{created++;delay=ms;return {fn};},
  clearTimeout:()=>{cleared++}
 });
 const response=await helper.fetchWithTimeout('https://storage.test/upload',{method:'POST'},60_000);
 assert.equal(response.ok,true);
 assert.equal(created,1);
 assert.equal(cleared,1);
 assert.equal(delay,60_000);
 assert.equal(received.length,1);
 assert.equal(received[0].init.method,'POST');
 assert.ok(received[0].init.signal instanceof AbortSignal);
 assert.equal(received[0].init.signal.aborted,false);
});

test('deadline aborts a stalled fetch and rejects with TimeoutError',async()=>{
 let signal;
 const helper=loadHelper((input,init)=>new Promise((_,reject)=>{
  signal=init.signal;
  init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
 }));
 await assert.rejects(helper.fetchWithTimeout('https://storage.test/upload',{},15),error=>error.name==='TimeoutError');
 assert.equal(signal.aborted,true);
});

test('caller abort is forwarded and invalid deadlines fail before fetch',async()=>{
 let calls=0;
 const helper=loadHelper((input,init)=>{calls++;return new Promise((_,reject)=>{
  init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
 });});
 const external=new AbortController();
 const pending=helper.fetchWithTimeout('https://storage.test/upload',{signal:external.signal},1000);
 external.abort(new Error('caller cancelled'));
 await assert.rejects(pending,/caller cancelled/);
 await assert.rejects(helper.fetchWithTimeout('https://storage.test/upload',{},0),/таймаут/i);
 assert.equal(calls,1);
});

test('channel attachment upload uses a 60-second deadline and never auto-retries',async()=>{
 const fetchCalls=[];
 const fetchImpl=async(url,options)=>{fetchCalls.push({url,options});return {ok:true};};
 const helper=loadHelper(fetchImpl);
 const {api,calls}=loadSocial(fetchImpl,helper);
 const file={type:'application/pdf',size:1024};
 const result=await api.uploadChannelAttachment('user-jwt','user-id',file);
 assert.equal(result.type,'file');
 assert.ok(result.path.endsWith(UUID+'.pdf'));
 assert.equal(calls.length,1);
 assert.equal(calls[0].timeoutMs,helper.CHANNEL_ATTACHMENT_UPLOAD_TIMEOUT_MS);
 assert.equal(calls[0].timeoutMs,60_000);
 assert.equal(fetchCalls.length,1);
 assert.equal(fetchCalls[0].options.method,'POST');
 assert.equal(fetchCalls[0].options.headers.Authorization,'Bearer user-jwt');
 assert.equal(fetchCalls[0].options.headers.apikey,'test-anon');
 assert.equal(fetchCalls[0].options.headers['Content-Type'],file.type);
 assert.equal(fetchCalls[0].options.headers['x-upsert'],'false');
 assert.equal(fetchCalls[0].options.body,file);
 assert.ok(fetchCalls[0].options.signal instanceof AbortSignal);
 await assert.rejects(api.uploadChannelAttachment('user-jwt','user-id',{type:'image/gif',size:1}),/Неподдерживаемый формат/);
 await assert.rejects(api.uploadChannelAttachment('user-jwt','user-id',{type:'application/pdf',size:25*1024*1024+1}),/25 МБ/);
 assert.equal(fetchCalls.length,1,'validation must reject before network and upload must not retry');
});
