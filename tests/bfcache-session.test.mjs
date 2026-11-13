import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldReloadAfterBfcacheRestore} from '../lib/bfcache-session.ts';

const session=(access_token,refresh_token)=>({access_token,refresh_token});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ordinary page loads do not trigger a BFCache session reload',()=>{
  assert.equal(shouldReloadAfterBfcacheRestore(false,session('a','r1'),session('b','r2')),false);
});

test('a restored page keeps its private UI when both session tokens match',()=>{
  const current=session('access-a','refresh-a');
  assert.equal(shouldReloadAfterBfcacheRestore(true,current,{...current}),false);
});

test('a restored page reloads after cross-tab logout or account replacement',()=>{
  assert.equal(shouldReloadAfterBfcacheRestore(true,session('access-a','refresh-a'),null),true);
  assert.equal(shouldReloadAfterBfcacheRestore(true,null,session('access-b','refresh-b')),true);
  assert.equal(shouldReloadAfterBfcacheRestore(true,session('access-a','refresh-a'),session('access-b','refresh-b')),true);
});

test('refresh-token rotation also invalidates a suspended page',()=>{
  assert.equal(shouldReloadAfterBfcacheRestore(true,session('access-a','refresh-old'),session('access-a','refresh-new')),true);
});

test('AppShell checks session identity on persisted pageshow and revalidates unchanged sessions',()=>{
  const shell=source('components/AppShell.tsx');
  assert.match(shell,/const onPageShow=\(event:PageTransitionEvent\)=>\{/);
  assert.match(shell,/if\(!event\.persisted\)return/);
  assert.match(shell,/shouldReloadAfterBfcacheRestore\(event\.persisted,session,loadSession\(\)\)/);
  assert.match(shell,/if\(document\.visibilityState==='visible'\)void run\(true\)/);
  assert.match(shell,/window\.addEventListener\('pageshow',onPageShow\)/);
  assert.match(shell,/window\.removeEventListener\('pageshow',onPageShow\)/);
});
