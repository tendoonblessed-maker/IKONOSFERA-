import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {
  historyRetryDelayMs,
  retryTransientHistoryRead
} from '../lib/history-retry.js';

const CHAT='11111111-1111-4111-8111-111111111111';
const MESSAGE='22222222-2222-4222-8222-222222222222';
const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');

function client(fetch){
  const compiled=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const exports={};
  vm.runInNewContext(compiled,{
    exports,process:{env:{
      NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'
    }},
    fetch,AbortSignal,Promise,Date,Math,JSON,URLSearchParams,Map,Set,Error,
    require(name){
      assert.equal(name,'./history-retry.js');
      return {retryTransientHistoryRead};
    }
  },{timeout:2000,filename:'supabase-rest.cjs'});
  return exports;
}

function response(status,body, retryAfter=null){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get(name){return name.toLowerCase()==='retry-after'?retryAfter:null;}},
    text:async()=>JSON.stringify(body)
  };
}

test('Retry-After supports delta seconds and HTTP dates with a three-second ceiling',()=>{
  assert.equal(historyRetryDelayMs('2',1000),2000);
  assert.equal(historyRetryDelayMs('0',1000),0);
  assert.equal(historyRetryDelayMs(new Date(2500).toUTCString(),1000),1000);
  assert.equal(historyRetryDelayMs('4',1000),null);
  assert.equal(historyRetryDelayMs('not-a-date',1000),250);
});

test('history retry helper retries a transient network error exactly once',async()=>{
  let attempts=0,waited=0;
  const value=await retryTransientHistoryRead(async()=>{
    attempts++;
    if(attempts===1)throw new TypeError('network unavailable');
    return 'recovered';
  },{sleep:async ms=>{waited=ms;},now:()=>1000});
  assert.equal(value,'recovered');
  assert.equal(attempts,2);
  assert.equal(waited,250);
});

test('history retry helper does not retry aborts, timeouts, permanent statuses or long Retry-After',async()=>{
  for(const name of ['AbortError','TimeoutError']){
    let attempts=0;
    const error=Object.assign(new Error(name),{name});
    await assert.rejects(retryTransientHistoryRead(async()=>{attempts++;throw error;}),error);
    assert.equal(attempts,1);
  }
  for(const error of [
    Object.assign(new Error('unauthorized'),{status:401}),
    Object.assign(new Error('rate limited'),{status:429,retryAfter:'4'})
  ]){
    let attempts=0;
    await assert.rejects(retryTransientHistoryRead(async()=>{attempts++;throw error;}),error);
    assert.equal(attempts,1);
  }
});

test('newest direct-history page retries a transient 503 with the same scoped GET',async()=>{
  const calls=[];
  const api=client(async(url,options)=>{
    calls.push({url,options});
    return calls.length===1
      ?response(503,{message:'temporarily unavailable'},'0')
      :response(200,[]);
  });
  const rows=await api.listMessages('signed-user-jwt',CHAT);
  assert.deepEqual(Array.from(rows),[]);
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,calls[1].url);
  assert.match(calls[0].url,/chat_id=eq\.11111111-1111-4111-8111-111111111111/);
  assert.match(calls[0].url,/order=created_at\.desc,id\.desc/);
  for(const call of calls){
    assert.equal(call.options.method,'GET');
    assert.equal(call.options.cache,'no-store');
    assert.equal(call.options.headers.Authorization,'Bearer signed-user-jwt');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
});

test('older direct-history page retries with the exact same keyset cursor',async()=>{
  const calls=[];
  const api=client(async(url,options)=>{
    calls.push({url,options});
    return calls.length===1
      ?response(429,{message:'slow down'},'0')
      :response(200,[]);
  });
  const cursor={id:MESSAGE,created_at:'2026-10-29T12:00:00.123456Z'};
  await api.listOlderMessages('signed-user-jwt',CHAT,cursor);
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,calls[1].url);
  assert.ok(calls[0].url.includes('created_at.lt.2026-10-29T12%3A00%3A00.123456Z'));
  assert.ok(calls[0].url.includes('id.lt.22222222-2222-4222-8222-222222222222'));
});

test('direct-history GETs do not retry permanent errors or a server delay over three seconds',async()=>{
  for(const first of [
    response(401,{message:'unauthorized'}),
    response(429,{message:'retry later'},'4')
  ]){
    let attempts=0;
    const api=client(async()=>{attempts++;return first;});
    await assert.rejects(api.listMessages('signed-user-jwt',CHAT));
    assert.equal(attempts,1);
  }
});

test('network TypeError is retried for direct history, but fetch timeouts are not',async()=>{
  let attempts=0;
  const api=client(async()=>{
    attempts++;
    if(attempts===1)throw new TypeError('offline');
    return response(200,[]);
  });
  await api.listMessages('signed-user-jwt',CHAT);
  assert.equal(attempts,2);

  let timeoutAttempts=0;
  const timeoutApi=client(async()=>{
    timeoutAttempts++;
    const error=new Error('timed out');error.name='TimeoutError';throw error;
  });
  await assert.rejects(timeoutApi.listOlderMessages('signed-user-jwt',CHAT,{
    id:MESSAGE,created_at:'2026-10-29T12:00:00Z'
  }));
  assert.equal(timeoutAttempts,1);
});
