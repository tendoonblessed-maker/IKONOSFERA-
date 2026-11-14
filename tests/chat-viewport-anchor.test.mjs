import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {captureChatViewportAnchor,restoreChatViewportAnchor,watchChatViewportIntent} from '../lib/chat-viewport-anchor.js';

function history(scrollTop,scrollHeight,clientHeight){
  return {scrollTop,scrollHeight,clientHeight};
}

test('keyboard resize keeps the newest message pinned to the bottom',()=>{
  const area=history(900,1200,280);
  const anchor=captureChatViewportAnchor(area);
  assert.deepEqual(anchor,{scrollTop:900,followBottom:true});

  area.clientHeight=160;
  assert.equal(restoreChatViewportAnchor(area,anchor),true);
  assert.equal(area.scrollTop,1040);
});

test('keyboard resize preserves the reader position in older history',()=>{
  const area=history(420,1600,500);
  const anchor=captureChatViewportAnchor(area);
  assert.deepEqual(anchor,{scrollTop:420,followBottom:false});

  area.clientHeight=300;
  assert.equal(restoreChatViewportAnchor(area,anchor),true);
  assert.equal(area.scrollTop,420);
});

test('restoring a pinned anchor clamps safely when content becomes shorter',()=>{
  const area=history(800,1000,200);
  const anchor=captureChatViewportAnchor(area);
  area.scrollHeight=600;
  area.clientHeight=200;

  assert.equal(restoreChatViewportAnchor(area,anchor),true);
  assert.equal(area.scrollTop,400);
});

test('invalid or missing scroll metrics are ignored safely',()=>{
  assert.equal(captureChatViewportAnchor(null),null);
  assert.equal(captureChatViewportAnchor(history(Number.NaN,100,20)),null);
  assert.equal(restoreChatViewportAnchor(null,{scrollTop:0,followBottom:true}),false);
  assert.equal(restoreChatViewportAnchor(history(0,Number.NaN,20),{scrollTop:0,followBottom:true}),false);
});

test('mobile viewport recovery is scoped to the same chat and resumes after PWA restore',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/captureChatViewportAnchor\(history\)/);
  assert.match(shell,/restoreChatViewportAnchor\(pending\.history,pending\.anchor\)/);
  assert.match(shell,/watchChatViewportIntent\(history,/);
  assert.match(shell,/pending\?\.stopWatching\(\)/);
  assert.match(shell,/cancelPendingAnchor\(\)/);
  assert.match(shell,/pending\.context!==viewportContextRef\.current/);
  assert.match(shell,/document\.querySelector\('\.conversation-pane\.open \.conversation-history'\)!==pending\.history/);
  assert.match(shell,/viewport\?\.addEventListener\('resize',update\)/);
  assert.match(shell,/viewport\?\.addEventListener\('scroll',updateScroll\)/);
  assert.match(shell,/window\.addEventListener\('pageshow',update\)/);
  assert.match(shell,/window\.addEventListener\('pagehide',onPageHide\)/);
  assert.match(shell,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
});


test('explicit history interaction cancels a pending viewport anchor and removes listeners',()=>{
  const target=new EventTarget();
  const intents=[];
  const stop=watchChatViewportIntent(target,type=>intents.push(type));
  target.dispatchEvent(new Event('wheel'));
  target.dispatchEvent(new Event('touchmove'));
  target.dispatchEvent(new Event('pointerdown'));
  const scrollKey=new Event('keydown');
  Object.defineProperty(scrollKey,'key',{value:'PageDown'});
  target.dispatchEvent(scrollKey);
  const ordinaryKey=new Event('keydown');
  Object.defineProperty(ordinaryKey,'key',{value:'a'});
  target.dispatchEvent(ordinaryKey);
  assert.deepEqual(intents,['wheel','touchmove','pointerdown','keydown'],
    'only user input that can move history cancels the pending anchor');
  stop();
  stop();
  target.dispatchEvent(new Event('wheel'));
  assert.deepEqual(intents,['wheel','touchmove','pointerdown','keydown'],
    'cleanup is idempotent and no listener survives restoration/cancellation');
});
