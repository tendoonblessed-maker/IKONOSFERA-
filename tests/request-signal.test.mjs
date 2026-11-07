import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequestAbortSignal} from '../lib/supabase-rest.ts';

test('caller abort is forwarded to the request signal',()=>{
  const caller=new AbortController();
  const request=createRequestAbortSignal(caller.signal,1000);
  caller.abort();
  assert.equal(request.signal.aborted,true);
  assert.equal(request.signal.reason,caller.signal.reason);
  request.dispose();
});

test('an already-aborted caller signal aborts immediately',()=>{
  const caller=new AbortController();
  caller.abort();
  const request=createRequestAbortSignal(caller.signal,1000);
  assert.equal(request.signal.aborted,true);
  request.dispose();
});

test('request timeout aborts with a TimeoutError',async()=>{
  const request=createRequestAbortSignal(undefined,15);
  await new Promise(resolve=>request.signal.addEventListener('abort',resolve,{once:true}));
  assert.equal(request.signal.aborted,true);
  assert.equal(request.signal.reason?.name,'TimeoutError');
  request.dispose();
});

test('dispose is idempotent and prevents a later timeout',async()=>{
  const request=createRequestAbortSignal(undefined,25);
  request.dispose();
  request.dispose();
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(request.signal.aborted,false);
});
