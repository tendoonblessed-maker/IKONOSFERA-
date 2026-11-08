import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {copyTextWithFallback} from '../lib/clipboard.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('uses the asynchronous Clipboard API when it succeeds',async()=>{
  const calls=[];
  await copyTextWithFallback('hello',async text=>{calls.push(['native',text]);},text=>{calls.push(['legacy',text]);return true;});
  assert.deepEqual(calls,[['native','hello']]);
});

test('uses the legacy fallback when the asynchronous API is unavailable',async()=>{
  const calls=[];
  await copyTextWithFallback('mobile text',null,text=>{calls.push(text);return true;});
  assert.deepEqual(calls,['mobile text']);
});

test('tries the legacy fallback when the asynchronous API rejects',async()=>{
  const calls=[];
  await copyTextWithFallback('copied after denial',async()=>{throw new Error('permission denied');},text=>{calls.push(text);return true;});
  assert.deepEqual(calls,['copied after denial']);
});

test('does not report success when neither clipboard path works',async()=>{
  await assert.rejects(copyTextWithFallback('not copied',null,()=>false),/Clipboard copy is unavailable/);
  await assert.rejects(copyTextWithFallback('not copied',async()=>{throw new Error('denied');},null),/Clipboard copy is unavailable/);
});

test('legacy browser fallback selects the exact text and removes its temporary control',()=>{
  const clipboard=source('lib/clipboard.ts');
  assert.match(clipboard,/document\.createElement\('textarea'\)/);
  assert.match(clipboard,/textarea\.setSelectionRange\(0,textarea\.value\.length\)/);
  assert.match(clipboard,/document\.execCommand\('copy'\)/);
  assert.match(clipboard,/textarea\.remove\(\)/);
  assert.match(clipboard,/active\.focus\(/);
  assert.match(clipboard,/active\.setSelectionRange/);
});

test('settings link and selected-message copy share the same mobile-safe clipboard helper',()=>{
  const shell=source('components/AppShell.tsx');
  assert.match(shell,/await copyTextToClipboard\(window\.location\.origin\+'\/'\)/);
  assert.match(shell,/void copyTextToClipboard\(text\)\.then/);
  assert.doesNotMatch(shell,/navigator\.clipboard\.writeText/);
});
