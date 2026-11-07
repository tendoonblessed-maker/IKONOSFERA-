import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('direct-message search forwards caller cancellation through a portable bounded request signal', () => {
  const api = read('lib/supabase-rest.ts');
  assert.ok(api.includes('export function createRequestAbortSignal('));
  assert.ok(api.includes('createRequestAbortSignal(options.signal,18000)'));
  assert.ok(api.includes('signal: requestAbort.signal'));
  assert.ok(api.includes('requestAbort.dispose()'));
  assert.equal(api.includes('AbortSignal.any('), false);
  assert.equal(api.includes('AbortSignal.timeout('), false);
  assert.ok(api.includes('offset=0,signal?:AbortSignal'));
  assert.ok(api.includes('p_offset:Math.max(0,Math.min(600,Math.floor(offset)))'));
  assert.match(api, /signal\s*\}\);/);
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
