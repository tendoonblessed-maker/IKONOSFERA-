import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldClearPrivateDraftsAfterSessionChange} from '../lib/cross-tab-session.ts';

const ALICE='11111111-1111-4111-8111-111111111111';
const BOB='22222222-2222-4222-8222-222222222222';
function token(sub,extra={}){
  const payload=Buffer.from(JSON.stringify({sub,...extra})).toString('base64url');
  return 'header.'+payload+'.signature';
}
function source(path){
  return readFileSync(new URL('../'+path,import.meta.url),'utf8');
}

test('same-account access-token rotation preserves private drafts',()=>{
  assert.equal(shouldClearPrivateDraftsAfterSessionChange(ALICE,token(ALICE,{iat:1})),false);
  assert.equal(shouldClearPrivateDraftsAfterSessionChange(ALICE.toUpperCase(),token(ALICE,{iat:2})),false);
});

test('logout and a different account clear the previous account drafts',()=>{
  assert.equal(shouldClearPrivateDraftsAfterSessionChange(ALICE,null),true);
  assert.equal(shouldClearPrivateDraftsAfterSessionChange(ALICE,token(BOB)),true);
});

test('malformed, unreadable or non-UUID JWT subjects fail closed',()=>{
  for(const value of [undefined,'not-a-jwt','a.b.c','header.e30.signature',token('not-a-uuid')]){
    assert.equal(shouldClearPrivateDraftsAfterSessionChange(ALICE,value),true);
  }
});

test('an unsigned-in tab has no previous account drafts to clear',()=>{
  assert.equal(shouldClearPrivateDraftsAfterSessionChange('',null),false);
});

test('AppShell clears tab-local private state before cross-tab rehydration',()=>{
  const app=source('components/AppShell.tsx');
  const start=app.indexOf('const onStorage=(event:StorageEvent)=>');
  const end=app.indexOf("window.addEventListener('storage',onStorage)",start);
  assert.ok(start>=0&&end>start,'cross-tab storage handler exists');
  const handler=app.slice(start,end);
  assert.match(handler,/shouldClearPrivateDraftsAfterSessionChange\(userId,stored\?\.access_token\)/);
  for(const clear of ['clearChatDrafts(userId)','clearGroupDrafts(userId)','clearAllGroupSendAttempts(userId)']){
    assert.ok(handler.indexOf(clear)>=0,'missing '+clear);
    assert.ok(handler.indexOf(clear)<handler.indexOf('window.location.reload()'),clear+' must run before reload');
  }
  assert.match(app,/\},\[session\?\.access_token,userId\]\);/);
});
