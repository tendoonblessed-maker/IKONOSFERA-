import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 MESSAGE_INTERACTIVE_SELECTOR,shouldBlockMessageSwipe
} from '../lib/message-gesture-guard.ts';

const component=()=>readFileSync(new URL('../components/SwipeReplyMessage.tsx',import.meta.url),'utf8');

test('links, buttons, editors and audio/video controls cannot initiate reply swipes',()=>{
 const selectors=MESSAGE_INTERACTIVE_SELECTOR.split(',');
 for(const selector of ['button','a','input','textarea','select','video','audio',
  '[role="button"]','[contenteditable="true"]']){
  assert.ok(selectors.includes(selector),selector+' must own its touch gesture');
 }
 assert.equal(shouldBlockMessageSwipe(false,1,true),true);
 assert.equal(shouldBlockMessageSwipe(false,1,false),false);
});

test('disabled and multi-touch gestures never initiate a reply',()=>{
 assert.equal(shouldBlockMessageSwipe(true,1,false),true);
 assert.equal(shouldBlockMessageSwipe(false,2,false),true);
 assert.equal(shouldBlockMessageSwipe(false,0,false),true);
 assert.equal(shouldBlockMessageSwipe(false,3,true),true);
});

test('single-finger swipes on plain message text still work',()=>{
 assert.equal(shouldBlockMessageSwipe(false,1,false),false);
 const ui=component();
 assert.match(ui,/delta:16/);
 assert.match(ui,/absX>=54/);
 assert.match(ui,/preventScrollOnSwipe:false/);
});

test('capture-phase guard persists through swipeable bubble-phase onSwiped',()=>{
 const ui=component();
 assert.match(ui,/onTouchStartCapture=\{onTouchStart\}/);
 assert.match(ui,/swipeBlocked\.current=shouldBlockMessageSwipe\(disabled,event\.touches\.length,interactive\)/);
 assert.match(ui,/if\(event\.touches\.length!==1\)\{\s*swipeBlocked\.current=true/);
 assert.match(ui,/onSwiping:[\s\S]*?if\(disabled\|\|swipeBlocked\.current\|\|wasHeld\.current\)return;/);
 assert.match(ui,/onSwiped:[\s\S]*?if\(!disabled&&!swipeBlocked\.current&&!wasHeld\.current/);
 assert.match(ui,/onTouchEndCapture=\{cancelHold\}/);
 assert.match(ui,/onTouchCancelCapture=\{cancelHold\}/);
 assert.doesNotMatch(ui,/onTouchEndCapture=\{[^}]*swipeBlocked\.current=false/);
 assert.match(ui,/event\.target instanceof Element&&event\.target\.closest\(MESSAGE_INTERACTIVE_SELECTOR\)/);
 assert.match(ui,/onContextMenu=\{event=>/);
});
