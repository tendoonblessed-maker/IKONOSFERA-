import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const atlasRequest={method:'GET',mode:'no-cors',url:'https://ikonosfera.test/status-emojis.webp?v=2'};

function fetchHandler({match=async()=>undefined,open=async()=>({put:async()=>{}}),network=async()=>({ok:true,clone(){return this;}})}={}){
 const handlers=new Map();
 let lastLifetime=[];
 const self={location:{origin:'https://ikonosfera.test'},addEventListener:(name,handler)=>handlers.set(name,handler)};
 vm.runInNewContext(source,{self,caches:{match,open},fetch:network,URL,Response,setTimeout,clearTimeout},{timeout:1000});
 const handle=request=>{
  let promise;
  lastLifetime=[];
  handlers.get('fetch')({
   request,
   respondWith:result=>{promise=result;},
   waitUntil:background=>{lastLifetime.push(background);}
  });
  return promise;
 };
 handle.lifetimePromises=()=>lastLifetime;
 return handle;
}

async function settleBackground(handle){
 await Promise.all(handle.lifetimePromises());
}

function lifecycleHandler({
 open=async()=>({add:async()=>{}}),
 keys=async()=>[],
 scheduleTimeout=(callback,delay)=>setTimeout(callback,delay),
 cancelTimeout=id=>clearTimeout(id)
}={}){
 const handlers=new Map();
 let skipped=0,claimed=0;
 const self={
  location:{origin:'https://ikonosfera.test'},
  clients:{claim:async()=>{claimed++;}},
  addEventListener:(name,handler)=>handlers.set(name,handler),
  skipWaiting:()=>{skipped++;}
 };
 vm.runInNewContext(source,{
  self,caches:{open,keys,delete:async()=>true},URL,Response,
  setTimeout:scheduleTimeout,clearTimeout:cancelTimeout
 },{timeout:1000});
 return {
  async install(){
   let completion;
   handlers.get('install')({waitUntil:promise=>{completion=promise;}});
   await completion;
  },
  async activate(){
   let completion;
   handlers.get('activate')({waitUntil:promise=>{completion=promise;}});
   await completion;
  },
  skipped:()=>skipped,
  claimed:()=>claimed
 };
}

test('public emoji atlas uses cached response without a network request',async()=>{
 const cached={source:'cache'};
 const handle=fetchHandler({match:async()=>cached,network:async()=>{throw Error('unexpected network');},open:async()=>{throw Error('cached response must not be rewritten');}});
 assert.equal(await handle(atlasRequest),cached);
 await settleBackground(handle);
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
 await settleBackground(handle);
 assert.equal(writes,1);
});

test('quota errors on cache write never discard an already downloaded atlas',async()=>{
 const networkResponse={ok:true,clone(){return this;}};
 const handle=fetchHandler({
  network:async()=>networkResponse,
  open:async()=>({put:async()=>{throw Error('QuotaExceededError');}})
 });
 assert.equal(await handle(atlasRequest),networkResponse);
 await settleBackground(handle);
});

test('denied cache open never discards the public image',async()=>{
 const networkResponse={ok:true,clone(){return this;}};
 const handle=fetchHandler({
  network:async()=>networkResponse,
  open:async()=>{throw Error('storage blocked');}
 });
 assert.equal(await handle(atlasRequest),networkResponse);
 await settleBackground(handle);
});

test('a slow optional cache write does not delay the public image response',async()=>{
 const networkResponse={ok:true,clone(){return this;}};
 let startWrite;
 const writeStarted=new Promise(resolve=>{startWrite=resolve;});
 let finishWrite;
 const pendingWrite=new Promise(resolve=>{finishWrite=resolve;});
 const handle=fetchHandler({
  network:async()=>networkResponse,
  open:async()=>({put:async()=>{startWrite();return pendingWrite;}})
 });
 const response=await Promise.race([
  handle(atlasRequest),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error('network response waited for Cache Storage')),100))
 ]);
 await writeStarted;
 assert.equal(response,networkResponse);
 assert.equal(handle.lifetimePromises().length,1);
 finishWrite();
 await settleBackground(handle);
});

test('private API requests, POST and cross-origin assets are never intercepted',()=>{
 const handle=fetchHandler();
 assert.equal(handle({method:'GET',mode:'cors',url:'https://ikonosfera.test/rest/v1/messages'}),undefined);
 assert.equal(handle({...atlasRequest,method:'POST'}),undefined);
 assert.equal(handle({...atlasRequest,url:'https://elsewhere.test/status-emojis.webp'}),undefined);
});

test('one failed precache asset does not reject installation or skip other public assets',async()=>{
 const attempted=[];
 const worker=lifecycleHandler({
  open:async()=>({add:async asset=>{
   attempted.push(asset);
   if(asset==='/icon-192.png')throw Error('optional icon unavailable');
  }})
 });
 await assert.doesNotReject(worker.install());
 assert.deepEqual(attempted,['/offline.html','/icon-192.png','/status-emojis.webp?v=2']);
 assert.equal(worker.skipped(),1);
});

test('a stalled precache request is bounded and cannot hold installation open',async()=>{
 const attempted=[];
 const worker=lifecycleHandler({
  open:async()=>({add:async asset=>{
   attempted.push(asset);
   if(asset==='/offline.html')return new Promise(()=>{});
  }}),
  // Keep the production 8-second bound but shorten it in this deterministic test.
  scheduleTimeout:callback=>setTimeout(callback,1)
 });
 await assert.doesNotReject(worker.install());
 assert.deepEqual(attempted,['/offline.html','/icon-192.png','/status-emojis.webp?v=2']);
 assert.equal(worker.skipped(),1);
});

test('Cache Storage denial does not prevent service worker installation',async()=>{
 const worker=lifecycleHandler({open:async()=>{throw Error('SecurityError');}});
 await assert.doesNotReject(worker.install());
 assert.equal(worker.skipped(),1);
});

test('activation still claims clients when cache cleanup is unavailable',async()=>{
 const worker=lifecycleHandler({keys:async()=>{throw Error('SecurityError');}});
 await assert.doesNotReject(worker.activate());
 assert.equal(worker.claimed(),1);
});

test('offline navigation fails closed when the offline cache lookup is denied',async()=>{
 const handle=fetchHandler({
  match:async()=>{throw Error('CacheStorage disabled');},
  network:async()=>{throw Error('offline');}
 });
 const response=await handle({method:'GET',mode:'navigate',url:'https://ikonosfera.test/private-chat'});
 assert.equal(response.type,'error');
});


const navigationRequest={method:'GET',mode:'navigate',url:'https://ikonosfera.test/private-chat'};

test('transient gateway failures use the cached offline shell',async()=>{
 const offlinePage={source:'offline-shell'};
 for(const status of [502,503,504]){
  const handle=fetchHandler({
   match:async()=>offlinePage,
   network:async()=>({status,ok:false})
  });
  assert.equal(await handle(navigationRequest),offlinePage,`HTTP ${status}`);
 }
});

test('ordinary application errors are not hidden by the offline shell',async()=>{
 const serverError={status:500,ok:false};
 const handle=fetchHandler({
  match:async()=>{throw Error('offline cache should not be consulted');},
  network:async()=>serverError
 });
 assert.equal(await handle(navigationRequest),serverError);
});

test('a gateway response is preserved when the offline cache is unavailable',async()=>{
 const gatewayError={status:503,ok:false};
 const handle=fetchHandler({
  match:async()=>{throw Error('CacheStorage disabled');},
  network:async()=>gatewayError
 });
 assert.equal(await handle(navigationRequest),gatewayError);
});
