import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldReloadAfterBfcacheRestore,shouldClearDraftsAfterBfcacheRestore} from '../lib/bfcache-session.ts';

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
  assert.match(shell,/const stored=loadSession\(\)/);
  assert.match(shell,/shouldReloadAfterBfcacheRestore\(event\.persisted,session,stored\)/);
  assert.match(shell,/if\(document\.visibilityState==='visible'\)void run\(true\)/);
  assert.match(shell,/window\.addEventListener\('pageshow',onPageShow\)/);
  assert.match(shell,/window\.removeEventListener\('pageshow',onPageShow\)/);
});

const ALICE='11111111-1111-4111-8111-111111111111';
const BOB='22222222-2222-4222-8222-222222222222';
const token=(sub,extra={})=>'header.'+Buffer.from(JSON.stringify({sub,...extra})).toString('base64url')+'.signature';

test('BFCache account switch clears drafts but same-account token rotation preserves them',()=>{
  assert.equal(shouldClearDraftsAfterBfcacheRestore(true,ALICE,token(ALICE,{iat:2})),false);
  assert.equal(shouldClearDraftsAfterBfcacheRestore(true,ALICE,token(BOB)),true);
  assert.equal(shouldClearDraftsAfterBfcacheRestore(true,ALICE,null),true);
});

test('BFCache draft cleanup fails closed for unreadable or malformed next identities',()=>{
  for(const value of [undefined,'not-a-jwt','header.e30.signature',token('not-a-uuid')]){
    assert.equal(shouldClearDraftsAfterBfcacheRestore(true,ALICE,value),true);
  }
  assert.equal(shouldClearDraftsAfterBfcacheRestore(true,'not-a-uuid',token(BOB)),true);
  assert.equal(shouldClearDraftsAfterBfcacheRestore(false,ALICE,token(BOB)),false);
  assert.equal(shouldClearDraftsAfterBfcacheRestore(true,'',null),false);
});

test('AppShell clears direct drafts, group drafts and send attempts before BFCache reload',()=>{
  const shell=source('components/AppShell.tsx');
  const start=shell.indexOf('const onPageShow=(event:PageTransitionEvent)=>{');
  const reloadStatement="window.location.reload();";
  const end=shell.indexOf(reloadStatement,start);
  assert.ok(start>=0&&end>start,'BFCache pageshow handler exists');
  const handler=shell.slice(start,end+reloadStatement.length);
  assert.match(handler,/shouldClearDraftsAfterBfcacheRestore\(event\.persisted,userId,stored\?\.access_token\)/);
  const clears=['clearChatDrafts(userId)','clearGroupDrafts(userId)','clearAllGroupSendAttempts(userId)'];
  for(const clear of clears){
    assert.ok(handler.indexOf(clear)>=0,'missing '+clear);
  }
  assert.ok(Math.max(...clears.map(clear=>handler.indexOf(clear)))<handler.indexOf('window.location.reload'));
});
