import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fetchWithTimeout,fetchJsonWithTimeout} from '../lib/fetch-timeout.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function abortError(){
 const error=new Error('The operation was aborted.');
 error.name='AbortError';
 return error;
}

test('caller AbortSignal is composed with the deadline and keeps cancellation distinct',async()=>{
 const caller=new AbortController();
 let requestSignal;
 const pending=fetchWithTimeout((_input,init)=>new Promise((_,reject)=>{
  requestSignal=init.signal;
  requestSignal.addEventListener('abort',()=>reject(abortError()),{once:true});
 }),'/resource',{signal:caller.signal},1000,'request timed out');
 caller.abort();
 await assert.rejects(pending,error=>error.name==='AbortError'&&!/timed out/.test(error.message));
 assert.notEqual(requestSignal,caller.signal);
 assert.equal(requestSignal.aborted,true);
 assert.equal(caller.signal.aborted,true);
});

test('an already-aborted caller signal reaches fetch without becoming a timeout',async()=>{
 const caller=new AbortController();
 caller.abort();
 let called=0;
 await assert.rejects(fetchWithTimeout((_input,init)=>{
  called++;
  assert.equal(init.signal.aborted,true);
  return Promise.reject(abortError());
 },'/resource',{signal:caller.signal},1000,'request timed out'),error=>error.name==='AbortError');
 assert.equal(called,1);
});

test('caller abort listener is removed after a successful response',async()=>{
 const caller=new AbortController();
 let requestSignal;
 const response={ok:true};
 const result=await fetchWithTimeout(async(_input,init)=>{
  requestSignal=init.signal;
  return response;
 },'/resource',{signal:caller.signal},100);
 caller.abort();
 await delay(5);
 assert.equal(result,response);
 assert.equal(requestSignal.aborted,false);
});

test('the timeout still aborts fetch and returns the configured timeout message',async()=>{
 let requestSignal;
 const pending=fetchWithTimeout((_input,init)=>new Promise((_,reject)=>{
  requestSignal=init.signal;
  requestSignal.addEventListener('abort',()=>reject(abortError()),{once:true});
 }),'/resource',{},5,'request timed out');
 await assert.rejects(pending,/request timed out/);
 assert.equal(requestSignal.aborted,true);
});

test('ordinary network failures are not rewritten as cancellation or timeout',async()=>{
 const networkError=new TypeError('offline');
 const caller=new AbortController();
 await assert.rejects(fetchWithTimeout(async()=>{throw networkError;},'/resource',{signal:caller.signal},50),error=>error===networkError);
});


test('JSON response bodies remain under the portable deadline after headers arrive',async()=>{
 let requestSignal;
 const pending=fetchJsonWithTimeout((_input,init)=>({
  json:()=>new Promise((_resolve,reject)=>{
   requestSignal=init.signal;
   requestSignal.addEventListener('abort',()=>reject(abortError()),{once:true});
  })
 }),'/resource',{},5,'response body timed out');
 await assert.rejects(pending,/response body timed out/);
 assert.equal(requestSignal.aborted,true);
});

test('JSON deadline returns parsed data and clears its timer after body consumption',async()=>{
 let requestSignal;
 const response={ok:true,json:async()=>({items:[1,2]})};
 const result=await fetchJsonWithTimeout(async(_input,init)=>{
  requestSignal=init.signal;
  return response;
 },'/resource',{},5);
 assert.equal(result.response,response);
 assert.deepEqual(result.data,{items:[1,2]});
 await delay(15);
 assert.equal(requestSignal.aborted,false);
});
