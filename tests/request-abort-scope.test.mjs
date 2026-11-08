import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAbortableRequestScope} from '../lib/request-abort-scope.ts';

test('pausing aborts the active request and a stale cleanup cannot clear a newer one',()=>{
  const scope=createAbortableRequestScope(60_000);
  const first=scope.begin();
  scope.abort();
  assert.equal(first.signal.aborted,true);

  const second=scope.begin();
  scope.clear(first);
  scope.abort();
  assert.equal(second.signal.aborted,true);
});

test('starting a replacement request aborts the previous request',()=>{
  const scope=createAbortableRequestScope(60_000);
  const first=scope.begin();
  const second=scope.begin();
  assert.equal(first.signal.aborted,true);
  assert.equal(second.signal.aborted,false);
  scope.clear(second);
  assert.equal(second.signal.aborted,false);
});

test('the existing request deadline still aborts a stalled read',async()=>{
  const scope=createAbortableRequestScope(5);
  const controller=scope.begin();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(controller.signal.aborted,true);
  scope.clear(controller);
});
