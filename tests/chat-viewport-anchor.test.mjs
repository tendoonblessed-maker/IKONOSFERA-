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


function eventTarget(){
  const listeners=new Map();
  return {
    addEventListener(type,listener){
      const bucket=listeners.get(type)||new Set();
      bucket.add(listener);
      listeners.set(type,bucket);
    },
    removeEventListener(type,listener){
      listeners.get(type)?.delete(listener);
    },
    dispatch(type,{target=this,key}={}){
      for(const listener of listeners.get(type)||[])listener({type,target,key});
    }
  };
}

test('only real history gestures cancel a pending viewport anchor',()=>{
  const target=eventTarget();
  const childControl={};
  const intents=[];
  const stop=watchChatViewportIntent(target,type=>intents.push(type));

  target.dispatch('pointerdown',{target:childControl});
  assert.deepEqual(intents,[],
    'tapping a nested message action must not cancel viewport restoration');

  target.dispatch('pointerdown',{target});
  target.dispatch('wheel',{target:childControl});
  target.dispatch('touchmove',{target:childControl});
  target.dispatch('keydown',{target,key:'PageDown'});
  target.dispatch('keydown',{target,key:'a'});
  assert.deepEqual(intents,['pointerdown','wheel','touchmove','keydown'],
    'scrollbar/background, wheel, touch and scroll keys cancel; ordinary keys do not');

  stop();
  stop();
  target.dispatch('wheel');
  assert.deepEqual(intents,['pointerdown','wheel','touchmove','keydown'],
    'cleanup is idempotent and no listener survives cancellation');
});
