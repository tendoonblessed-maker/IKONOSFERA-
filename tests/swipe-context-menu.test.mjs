import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  TOUCH_CONTEXT_MENU_SUPPRESSION_MS,
  shouldCancelTouchGesture,
  shouldSuppressDuplicateContextMenu
} from '../lib/swipe-context-menu.mjs';
import {readFileSync} from 'node:fs';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('suppresses a native contextmenu event immediately after touch long-press opened the app menu',()=>{
  const openedAt=500;
  assert.equal(shouldSuppressDuplicateContextMenu(openedAt,openedAt),true);
  assert.equal(shouldSuppressDuplicateContextMenu(openedAt,openedAt+400),true);
  assert.equal(shouldSuppressDuplicateContextMenu(openedAt,openedAt+TOUCH_CONTEXT_MENU_SUPPRESSION_MS),true);
});

test('keeps later context menus available after the duplicate-event window',()=>{
  const openedAt=500;
  assert.equal(shouldSuppressDuplicateContextMenu(openedAt,openedAt+TOUCH_CONTEXT_MENU_SUPPRESSION_MS+1),false);
});

test('does not suppress when timestamps are missing, invalid, or from an impossible future',()=>{
  assert.equal(shouldSuppressDuplicateContextMenu(null,1000),false);
  assert.equal(shouldSuppressDuplicateContextMenu(Number.NaN,1000),false);
  assert.equal(shouldSuppressDuplicateContextMenu(1000,Number.POSITIVE_INFINITY),false);
  assert.equal(shouldSuppressDuplicateContextMenu(1001,1000),false);
});

test('cancels a pending touch gesture when the page is hidden or the window loses focus',()=>{
  assert.equal(shouldCancelTouchGesture('hidden',true),true);
  assert.equal(shouldCancelTouchGesture('visible',false),true);
  assert.equal(shouldCancelTouchGesture('prerender',true),true);
  assert.equal(shouldCancelTouchGesture('visible',true),false);
});

test('message swipe component cancels pending holds on visibility and focus interruption',()=>{
  const component=load('components/SwipeReplyMessage.tsx');
  assert.match(component,/shouldCancelTouchGesture\(document\.visibilityState,document\.hasFocus\(\)\)/);
  assert.match(component,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
  assert.match(component,/document\.removeEventListener\('visibilitychange',onVisibilityChange\)/);
  assert.match(component,/window\.addEventListener\('blur',onWindowBlur\)/);
  assert.match(component,/window\.removeEventListener\('blur',onWindowBlur\)/);
  assert.match(component,/wasHeld\.current=true;\s*setMovement\(0\)/);
  assert.match(component,/return\(\)=>\{\s*document\.removeEventListener/);
});

test('message swipe component records the long-press time and consumes only a duplicate contextmenu',()=>{
  const component=load('components/SwipeReplyMessage.tsx');
  assert.match(component,/lastTouchMenuAt\.current=monotonicNow\(\)/);
  assert.match(component,/shouldSuppressDuplicateContextMenu\(lastTouchMenuAt\.current,monotonicNow\(\)\)/);
  assert.match(component,/event\.preventDefault\(\);\s*lastTouchMenuAt\.current=null;\s*return;/);
  assert.match(component,/lastTouchMenuAt\.current=null;\s*wasHeld\.current=false;/);
  assert.match(component,/target\.closest\('button,a,input,textarea,select,video,audio/);
});
