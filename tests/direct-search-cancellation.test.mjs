import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('direct-message search forwards caller cancellation through a portable bounded request signal', () => {
  const api = read('lib/supabase-rest.ts');
  const helper = read('lib/request-signal.js');
  const start = api.indexOf('async function http<T>');
  const end = api.indexOf('\\nexport function loadSession', start);
  const http = api.slice(start, end);
  assert.ok(api.includes("import {createRequestAbortSignal} from './request-signal.js';"));
  assert.ok(http.includes('createRequestAbortSignal(options.signal,18000)'));
  assert.ok(http.includes('signal: requestAbort.signal'));
  assert.ok(http.includes('requestAbort.dispose()'));
  assert.equal(http.includes('AbortSignal.any('), false);
  assert.equal(http.includes('AbortSignal.timeout('), false);
  assert.doesNotMatch(helper, /AbortSignal\\.(?:any|timeout)\\(/);
  assert.ok(api.includes('offset=0,signal?:AbortSignal'));
  assert.ok(api.includes('p_offset:Math.max(0,Math.min(600,Math.floor(offset)))'));
  assert.ok(api.includes('signal\\n });'));
});
test('private-chat search aborts the previous request and debounce timer on cleanup', () => {
  const shell = read('components/AppShell.tsx');
  assert.match(shell, /const controller=new AbortController\(\)/);
  assert.match(shell, /let cancelled=false/);
  assert.match(shell, /!cancelled&&messageSearchRequestRef\.current===requestId/);
  assert.match(shell, /searchDirectMessages\(token,chatId,term,offset,controller\.signal\)/);
  assert.match(shell, /cancelled=true;\s*window\.clearTimeout\(timer\);\s*controller\.abort\(\)/);
});

test('aborted private-chat searches cannot publish results, errors or loading completion', () => {
  const shell = read('components/AppShell.tsx');
  assert.match(shell, /if\(!belongs\(\)\)return;[\s\S]*setMessageSearchResults/);
  assert.match(shell, /catch\(\(\)=>\{\s*if\(belongs\(\)\)setMessageSearchError\(true\)/);
  assert.match(shell, /finally\(\(\)=>\{\s*if\(belongs\(\)\)setMessageSearchLoading\(false\)/);
});
