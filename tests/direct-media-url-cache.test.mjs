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
