import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('direct-message search forwards a caller abort signal without dropping its request timeout', () => {
  const api = read('lib/supabase-rest.ts');
  assert.match(api, /signal\?: AbortSignal/);
  assert.match(api, /const timeoutSignal=AbortSignal\.timeout\(18000\)/);
  assert.match(api, /AbortSignal\.any\(\[options\.signal,timeoutSignal\]\)/);
  assert.match(api, /searchDirectMessages\([\s\S]*offset=0,signal\?:AbortSignal/);
  assert.match(api, /p_offset:Math\.max\(0,Math\.min\(600,Math\.floor\(offset\)\)\)[\s\S]*},\s*signal\s*\}\);/);
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
  assert.match(shell, /catch\(\)=>\{\s*if\(belongs\(\)\)setMessageSearchError\(true\)/);
  assert.match(shell, /finally\(\)=>\{\s*if\(belongs\(\)\)setMessageSearchLoading\(false\)/);
});
