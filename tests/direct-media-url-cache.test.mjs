import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const requestSignalSource=readFileSync(new URL('../lib/request-signal.js',import.meta.url),'utf8');
const requestSignalCompiled=ts.transpileModule(requestSignalSource,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const requestSignalExports={};
vm.runInNewContext(requestSignalCompiled,{
 exports:requestSignalExports,AbortController,setTimeout,clearTimeout
},{filename:'request-signal.cjs',timeout:2500});
const CHAT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEDIA='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PATH=CHAT+'/'+USER+'/'+MEDIA+'.jpg';
const OTHER=CHAT+'/'+USER+'/'+MEDIA+'.png';
const reply=signedURL=>({ok:true,json:async()=>({signedURL})});
const signedURL=(path,token)=>'/object/sign/ikonosfera-direct-media/'+path+'?token='+token;
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function scenario(handler,{AbortSignalImpl=AbortSignal}={}){
 const calls=[];
 const ctx={
  exports:{},process:{env:{
   NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.invalid',
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-anon-test'
  }},
  AbortSignal:AbortSignalImpl,
  AbortController,
  require:id=>{
   if(id==='./request-signal.js')return requestSignalExports;
   throw Error('Unexpected module '+id);
  },
  URL,
  fetch:(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  }
 };
 vm.runInNewContext(compiled,ctx,{filename:'supabase-rest.cjs',timeout:2500});
 return {api:ctx.exports,calls};
}

test('parallel private media previews share a signing request and reuse its result',async()=>{
 const pending=deferred();
 const {api,calls}=scenario(()=>pending.promise);
 const first=api.getDirectMediaUrl('account-one-jwt',PATH);
 const second=api.getDirectMediaUrl('account-one-jwt',PATH);
 assert.equal(calls.length,1,'a list of identical previews must not create duplicate signing calls');
 assert.equal(calls[0].options.headers.Authorization,'Bearer account-one-jwt');
 pending.resolve(reply(signedURL(PATH,'abc')));
 const [a,b]=await Promise.all([first,second]);
 assert.equal(a,'https://example.supabase.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=abc');
 assert.equal(b,a);
 assert.equal(await api.getDirectMediaUrl('account-one-jwt',PATH),a);
 assert.equal(calls.length,1);
});

test('late failure of an invalidated signing request cannot evict a newer retry',async()=>{
 const old=deferred(),fresh=deferred();
 const {api,calls}=scenario((url,options,n)=>n===1?old.promise:fresh.promise);
 const oldCall=api.getDirectMediaUrl('same-jwt',PATH);
 api.invalidateDirectMediaUrl('same-jwt',PATH);
 const newCall=api.getDirectMediaUrl('same-jwt',PATH);
 assert.equal(calls.length,2,'explicit media retry must create a fresh signing request');
 const oldFailure=assert.rejects(oldCall,/old signing request failed/);
 old.reject(Error('old signing request failed'));
 await oldFailure;
 // The old catch handler has run; it must not remove the new entry.
 const concurrent=api.getDirectMediaUrl('same-jwt',PATH);
 assert.equal(calls.length,2,'late old rejection must not cause a third signing call');
 fresh.resolve(reply(signedURL(PATH,'fresh')));
 const [newUrl,concurrentUrl]=await Promise.all([newCall,concurrent]);
 assert.equal(newUrl,concurrentUrl);
 assert.match(newUrl,/token=fresh$/);
 assert.equal(await api.getDirectMediaUrl('same-jwt',PATH),newUrl);
 assert.equal(calls.length,2);
});

test('a failed current signing request is evicted so the next retry can succeed',async()=>{
 const {api,calls}=scenario((url,options,n)=>n===1
  ?Promise.reject(Error('temporary offline'))
  :Promise.resolve(reply(signedURL(PATH,'recovered'))));
 await assert.rejects(api.getDirectMediaUrl('jwt',PATH),/temporary offline/);
 const recovered=await api.getDirectMediaUrl('jwt',PATH);
 assert.match(recovered,/token=recovered$/);
 assert.equal(calls.length,2);
 assert.equal(await api.getDirectMediaUrl('jwt',PATH),recovered);
 assert.equal(calls.length,2);
});

test('signed URLs and invalidation are isolated by account token and object path',async()=>{
 const {api,calls}=scenario((url,options,n)=>{const path=url.split('/ikonosfera-direct-media/')[1];return Promise.resolve(reply(signedURL(path,String(n))));});
 const first=await api.getDirectMediaUrl('user-one',PATH);
 const second=await api.getDirectMediaUrl('user-two',PATH);
 const third=await api.getDirectMediaUrl('user-one',OTHER);
 assert.equal(calls.length,3);
 assert.notEqual(first,second);
 assert.notEqual(first,third);
 api.invalidateDirectMediaUrl('user-one',PATH);
 assert.equal(await api.getDirectMediaUrl('user-two',PATH),second);
 assert.equal(await api.getDirectMediaUrl('user-one',OTHER),third);
 assert.equal(calls.length,3,'one account/path invalidation must not touch other cache entries');
 assert.notEqual(await api.getDirectMediaUrl('user-one',PATH),first);
 assert.equal(calls.length,4);
});

test('private signed media URLs are same-origin, tokenized and bound to the requested object',()=>{
 const {api}=scenario(()=>Promise.resolve(reply(signedURL(PATH,'unused'))));
 const expected='https://example.supabase.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=abc';
 assert.equal(api.resolveDirectMediaSignedUrl(signedURL(PATH,'abc'),PATH),expected);
 assert.equal(api.resolveDirectMediaSignedUrl('/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=abc',PATH),expected);
 assert.equal(api.resolveDirectMediaSignedUrl('https://example.supabase.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=abc',PATH),expected);
 for(const value of [
  'https://evil.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=x',
  '//evil.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=x',
  '/object/sign/other-bucket/'+PATH+'?token=x',
  '/object/sign/ikonosfera-direct-media/'+OTHER+'?token=x',
  '/object/sign/ikonosfera-direct-media/'+PATH,
  'https://user:pass@example.supabase.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=x',
  'javascript:alert(1)'
 ])assert.throws(()=>api.resolveDirectMediaSignedUrl(value,PATH),/Недопустимый URL вложения/);
});

test('getDirectMediaUrl rejects a foreign signing host and evicts it so a valid retry can recover',async()=>{
 let calls=0;
 const {api}=scenario(()=>{
  calls++;
  return Promise.resolve(reply(calls===1
   ?'https://evil.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=bad'
   :signedURL(PATH,'recovered')));
 });
 await assert.rejects(api.getDirectMediaUrl('jwt',PATH),/Недопустимый URL вложения/);
 const recovered=await api.getDirectMediaUrl('jwt',PATH);
 assert.equal(recovered,'https://example.supabase.invalid/storage/v1/object/sign/ikonosfera-direct-media/'+PATH+'?token=recovered');
 assert.equal(calls,2);
});

test('invalid object paths cannot reach the private Storage signing endpoint',async()=>{
 const {api,calls}=scenario(()=>Promise.resolve(reply('/object/sign/file')));
 for(const path of ['../private.jpg','https://evil.invalid/file',CHAT+'/'+USER+'/../../other.jpg',CHAT+'/'+USER+'/x.svg']){
  await assert.rejects(api.getDirectMediaUrl('jwt',path),/Недопустимый путь вложения/);
 }
 assert.equal(calls.length,0);
});

test('private media signing uses a portable timeout without AbortSignal.timeout',async()=>{
 const LegacyAbortSignal=function(){};
 assert.equal(LegacyAbortSignal.timeout,undefined);
 assert.match(source,/createRequestAbortSignal\(entry\.controller\.signal,18000\)/,'the existing 18-second bound remains in force');
 const {api,calls}=scenario(
  ()=>Promise.resolve(reply(signedURL(PATH,'portable'))),
  {AbortSignalImpl:LegacyAbortSignal}
 );
 const result=await api.getDirectMediaUrl('jwt',PATH);
 assert.match(result,/token=portable$/);
 assert.equal(calls.length,1);
 assert.ok(calls[0].options.signal,'signed-media fetch receives an AbortController signal');
 assert.equal(typeof calls[0].options.signal.addEventListener,'function');
 assert.equal(typeof calls[0].options.signal.removeEventListener,'function');
});


test('aborting one mounted preview keeps a shared signed URL request alive for the other',async()=>{
 const pending=deferred();
 const {api,calls}=scenario(()=>pending.promise);
 const firstController=new AbortController();
 const secondController=new AbortController();
 const first=api.getDirectMediaUrl('shared-jwt',PATH,firstController.signal);
 const firstFailure=assert.rejects(first,error=>error?.name==='AbortError');
 const second=api.getDirectMediaUrl('shared-jwt',PATH,secondController.signal);
 assert.equal(calls.length,1,'both previews share one private signing request');
 firstController.abort();
 await firstFailure;
 assert.equal(calls[0].options.signal.aborted,false,'one unmount must not cancel another preview');
 pending.resolve(reply(signedURL(PATH,'shared')));
 const result=await second;
 assert.match(result,/token=shared$/);
 assert.equal(calls.length,1);
});

test('aborting the last preview cancels the signing request and permits a clean retry',async()=>{
 const {api,calls}=scenario((url,options,n)=>{
  if(n>1)return Promise.resolve(reply(signedURL(PATH,'recovered')));
  return new Promise((resolve,reject)=>{
   const abort=()=>{
    const error=new Error('signing request aborted');
    error.name='AbortError';
    reject(error);
   };
   options.signal.addEventListener('abort',abort,{once:true});
   if(options.signal.aborted)abort();
  });
 });
 const firstController=new AbortController();
 const secondController=new AbortController();
 const first=api.getDirectMediaUrl('cancel-jwt',PATH,firstController.signal);
 const second=api.getDirectMediaUrl('cancel-jwt',PATH,secondController.signal);
 const firstFailure=assert.rejects(first,error=>error?.name==='AbortError');
 const secondFailure=assert.rejects(second,error=>error?.name==='AbortError');
 assert.equal(calls.length,1);
 firstController.abort();
 assert.equal(calls[0].options.signal.aborted,false,'the shared fetch remains while one consumer is mounted');
 secondController.abort();
 assert.equal(calls[0].options.signal.aborted,true,'the underlying fetch is aborted after the final consumer leaves');
 await Promise.all([firstFailure,secondFailure]);
 const recovered=await api.getDirectMediaUrl('cancel-jwt',PATH);
 assert.match(recovered,/token=recovered$/);
 assert.equal(calls.length,2,'a cancelled in-flight entry must not poison the next retry');
});

test('an already-aborted media consumer does not start a signing request',async()=>{
 const {api,calls}=scenario(()=>Promise.resolve(reply(signedURL(PATH,'unused'))));
 const controller=new AbortController();
 controller.abort();
 await assert.rejects(api.getDirectMediaUrl('jwt',PATH,controller.signal),error=>error?.name==='AbortError');
 assert.equal(calls.length,0);
});

test('ChatMedia aborts its signing consumer when the effect is cleaned up',()=>{
 const component=readFileSync(new URL('../components/ChatMedia.tsx',import.meta.url),'utf8');
 assert.match(component,/const controller=new AbortController\(\)/);
 assert.match(component,/getDirectMediaUrl\(token,path,controller\.signal\)/);
 assert.match(component,/controller\.abort\(\)/);
});


test('a signal aborted during request setup also cancels the newly created fetch',async()=>{
 const controller=new AbortController();
 const {api,calls}=scenario((url,options)=>{
  controller.abort();
  return new Promise((resolve,reject)=>{
   const abort=()=>{
    const error=new Error('setup request aborted');
    error.name='AbortError';
    reject(error);
   };
   options.signal.addEventListener('abort',abort,{once:true});
   if(options.signal.aborted)abort();
  });
 });
 await assert.rejects(api.getDirectMediaUrl('setup-jwt',PATH,controller.signal),error=>error?.name==='AbortError');
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.signal.aborted,true,'the fetch created before the consumer listener must still be stopped');
});

test('cache capacity never evicts an in-flight signing request with mounted consumers',async()=>{
 const deferreds=[];
 const pathFor=index=>CHAT+'/'+USER+'/dddddddd-dddd-4ddd-8ddd-'+String(index).padStart(12,'0')+'.jpg';
 const {api,calls}=scenario(url=>{
  const pending=deferred();
  pending.path=url.split('/ikonosfera-direct-media/')[1];
  deferreds.push(pending);
  return pending.promise;
 });
 const paths=Array.from({length:121},(_,index)=>pathFor(index));
 const pending=paths.map(path=>api.getDirectMediaUrl('bounded-cache-jwt',path));
 assert.equal(calls.length,121,'each distinct object starts one signing request');
 const duplicate=api.getDirectMediaUrl('bounded-cache-jwt',paths[0]);
 assert.equal(calls.length,121,'the oldest active entry remains shared beyond the nominal cache limit');
 for(let index=0;index<deferreds.length;index++){
  deferreds[index].resolve(reply(signedURL(paths[index],'token-'+index)));
 }
 const results=await Promise.all([...pending,duplicate]);
 assert.equal(results[0],results[121],'both mounted previews receive the same signed URL');
 assert.equal(calls.length,121,'cache pressure must not create a duplicate request for an active preview');
});
