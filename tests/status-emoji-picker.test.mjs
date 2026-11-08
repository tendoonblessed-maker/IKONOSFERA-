import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {getNextStatusEmojiFocusIndex} from '../lib/status-emoji-navigation.ts';

const source=readFileSync(new URL('../components/StatusEmojiPicker.tsx',import.meta.url),'utf8');

test('arrow keys move through the no-status option and emoji choices',()=>{
 const count=19;
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',count),1);
 assert.equal(getNextStatusEmojiFocusIndex(1,'ArrowDown',count),2);
 assert.equal(getNextStatusEmojiFocusIndex(2,'ArrowLeft',count),1);
 assert.equal(getNextStatusEmojiFocusIndex(2,'ArrowUp',count),1);
});

test('arrow navigation wraps at both ends of the picker',()=>{
 const count=19;
 assert.equal(getNextStatusEmojiFocusIndex(count-1,'ArrowRight',count),0);
 assert.equal(getNextStatusEmojiFocusIndex(count-1,'ArrowDown',count),0);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowLeft',count),count-1);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowUp',count),count-1);
});

test('Home and End move directly to the first and last choices',()=>{
 assert.equal(getNextStatusEmojiFocusIndex(8,'Home',19),0);
 assert.equal(getNextStatusEmojiFocusIndex(0,'End',19),18);
});

test('unsupported keys and invalid item counts do not move focus',()=>{
 assert.equal(getNextStatusEmojiFocusIndex(2,'Enter',19),null);
 assert.equal(getNextStatusEmojiFocusIndex(2,'Tab',19),null);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',0),null);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',-1),null);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',1.5),null);
});

test('picker exposes one roving tab stop and radio semantics for assistive technology',()=>{
 assert.match(source,/role="radiogroup"/);
 assert.match(source,/role="radio" aria-checked=\{value===null\}/);
 assert.match(source,/tabIndex=\{selectedIndex===0\?0:-1\}/);
 assert.match(source,/tabIndex=\{selectedIndex===focusIndex\?0:-1\}/);
 assert.match(source,/choiceRefs\.current\[next\]\?\.focus\(\)/);
 assert.match(source,/onKeyDown=\{event=>handleKeyDown\(/);
 assert.doesNotMatch(source,/aria-pressed=/);
});
