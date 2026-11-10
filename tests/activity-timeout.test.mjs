import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fetchWithTimeout} from '../lib/fetch-timeout.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('activity API routes every request through the portable 18-second deadline',()=>{
 const activity=source('lib/activity.ts');
 const helper=source('lib/fetch-timeout.mjs');
 const executable=helper.replace(/\\/\\*[\\s\\S]*?\\*\\/|\\/\\/.*$/gm,'');
 assert.ok(activity.includes('fetchWithTimeout(fetch,apiUrl+path'));
 assert.ok(activity.includes('ACTIVITY_REQUEST_TIMEOUT_MS=18000'));
 assert.ok(executable.includes('new AbortController()'));
 assert.ok(!executable.includes('AbortSignal.timeout'));
});

test('successful activity requests preserve the response and clear their timeout',async()=>{
 let signal;
 const response={ok:true,json:async()=>({status:'online'})};
 const result=await fetchWithTimeout(async(_input,init)=>{
  signal=init.signal;
  return response;
 },'/activity',{},5);
 assert.equal(result,response);
 assert.deepEqual(await result.json(),{status:'online'});
 await delay(15);
 assert.equal(signal.aborted,false);
});

test('a stalled activity request is aborted and returns a readable timeout error',async()=>{
 let signal;
 const pending=fetchWithTimeout((_input,init)=>new Promise((_,reject)=>{
  signal=init.signal;
  signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
 }),'/activity',{},5,'Сервер активности не ответил вовремя.');
 await assert.rejects(pending,/Сервер активности не ответил вовремя/);
 assert.equal(signal.aborted,true);
});

test('ordinary network failures remain distinguishable from a timeout',async()=>{
 const networkError=new TypeError('offline');
 let signal;
 await assert.rejects(
  fetchWithTimeout(async(_input,init)=>{signal=init.signal;throw networkError;},'/activity',{},50),
  error=>error===networkError
 );
 await delay(60);
 assert.equal(signal.aborted,false);
});
