import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const atlasRequest={method:'GET',mode:'no-cors',url:'https://ikonosfera.test/status-emojis.webp?v=2'};

function fetchHandler({match=async()=>undefined,open=async()=>({put:async()=>{}}),network=async()=>({ok:true,clone(){return this;}})}={}){
 const handlers=new Map();
 const self={location:{origin:'https://ikonosfera.test'},addEventListener:(name,handler)=>handlers.set(name,handler)};
 vm.runInNewContext(source,{self,caches:{match,open},fetch:network,URL,Response},{timeout:1000});
 return request=>{
  let promise;
  handlers.get('fetch')({request,respondWith:result=>{promise=result;}});
  return promise;
 };
}

test('public emoji atlas uses cached response without a network request',async()=>{
 const cached={source:'cache'};
 const handle=fetchHandler({match:async()=>cached,network:async()=>{throw Error('unexpected network');}});
 assert.equal(await handle(atlasRequest),cached);
});

test('denied cache read falls back to a successful network response',async()=>{
 const networkResponse={ok:true,clone(){return this;}};
 let writes=0;
 const handle=fetchHandler({
  match:async()=>{throw Error('CacheStorage disabled');},
  network:async()=>networkResponse,
  open:async()=>({put:async()=>{writes++;}})
 });
 assert.equal(await handle(atlasRequest),networkResponse);
 assert.equal(writes,1);
});

test('quota errors on cache write never discard an already downloaded atlas',async()=>{
 const networkResponse={ok:true,clone(){return this;}};
 const handle=fetchHandler({
  network:async()=>networkResponse,
  open:async()=>({put:async()=>{throw Error('QuotaExceededError');}})
 });
 assert.equal(await handle(atlasRequest),networkResponse);
});

test('denied cache open never discards the public image',async()=>{
 const networkResponse={ok:true,clone(){return this;}};
 const handle=fetchHandler({
  network:async()=>networkResponse,
  open:async()=>{throw Error('storage blocked');}
 });
 assert.equal(await handle(atlasRequest),networkResponse);
});

test('private API requests, POST and cross-origin assets are never intercepted',()=>{
 const handle=fetchHandler();
 assert.equal(handle({method:'GET',mode:'cors',url:'https://ikonosfera.test/rest/v1/messages'}),undefined);
 assert.equal(handle({...atlasRequest,method:'POST'}),undefined);
 assert.equal(handle({...atlasRequest,url:'https://elsewhere.test/status-emojis.webp'}),undefined);
});
