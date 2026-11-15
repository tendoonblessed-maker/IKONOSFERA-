import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  getMessageReactionPickerNextIndex,
  shouldCloseMessageReactionPickerOnKeydown
} from '../lib/message-reaction-picker.ts';

const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');

test('reaction picker arrow keys wrap and Home/End select the boundaries',()=>{
  assert.equal(getMessageReactionPickerNextIndex(0,'ArrowLeft',7),6);
  assert.equal(getMessageReactionPickerNextIndex(6,'ArrowRight',7),0);
  assert.equal(getMessageReactionPickerNextIndex(3,'ArrowLeft',7),2);
  assert.equal(getMessageReactionPickerNextIndex(3,'ArrowRight',7),4);
  assert.equal(getMessageReactionPickerNextIndex(4,'Home',7),0);
  assert.equal(getMessageReactionPickerNextIndex(1,'End',7),6);
});

test('reaction picker ignores unsupported keys and invalid focus indexes',()=>{
  assert.equal(getMessageReactionPickerNextIndex(0,'Enter',7),null);
  assert.equal(getMessageReactionPickerNextIndex(-1,'ArrowRight',7),null);
  assert.equal(getMessageReactionPickerNextIndex(7,'ArrowLeft',7),null);
  assert.equal(getMessageReactionPickerNextIndex(0,'ArrowRight',0),null);
});

test('Escape dismisses the reaction picker but never interrupts IME composition',()=>{
  assert.equal(shouldCloseMessageReactionPickerOnKeydown({key:'Escape',isComposing:false,keyCode:27}),true);
  assert.equal(shouldCloseMessageReactionPickerOnKeydown({key:'Tab',isComposing:false,keyCode:9}),false);
  assert.equal(shouldCloseMessageReactionPickerOnKeydown({key:'Escape',isComposing:true,keyCode:27}),false);
  assert.equal(shouldCloseMessageReactionPickerOnKeydown({key:'Escape',isComposing:false,keyCode:229}),false);
});

test('message reaction picker exposes its trigger relationship and accessible group',()=>{
  assert.match(shell,/aria-expanded=\{messageReactionPicker===message\.id\}/);
  assert.match(shell,/aria-controls=\{'ik-message-reaction-picker-'\+message\.id\}/);
  assert.match(shell,/role="group"\s+aria-label="Выбрать реакцию"/);
  assert.match(shell,/aria-label="Реакция "\+emoji/);
});

test('reaction picker closes on outside pointer or focus and restores focus on Escape',()=>{
  assert.match(shell,/document\.addEventListener\('pointerdown',closeOnOutsidePointer\)/);
  assert.match(shell,/document\.addEventListener\('focusin',closeOnOutsideFocus\)/);
  assert.match(shell,/document\.removeEventListener\('pointerdown',closeOnOutsidePointer\)/);
  assert.match(shell,/document\.removeEventListener\('focusin',closeOnOutsideFocus\)/);
  assert.match(shell,/messageReactionPickerTriggerRef\.current\?\.focus\(\{preventScroll:true\}\)/);
  assert.match(shell,/setMessageReactionPicker\(null\);\s*setSelectedMessages\(\[\]\)/);
});

test('arrow navigation does not steal IME candidate keys and focus has a visible indicator',()=>{
  assert.match(shell,/event\.nativeEvent\.isComposing\|\|event\.nativeEvent\.keyCode===229/);
  assert.match(shell,/getMessageReactionPickerNextIndex\(index,event\.key,buttons\.length\)/);
  assert.match(css,/\.reaction-picker button:focus-visible\{outline:2px solid/);
});
