import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {getNextStatusEmojiFocusIndex} from '../lib/status-emoji-navigation.ts';

const source=readFileSync(new URL('../components/StatusEmojiPicker.tsx',import.meta.url),'utf8');
const emojiSource=readFileSync(new URL('../components/StatusEmoji.tsx',import.meta.url),'utf8');
const emojiCount=Number(emojiSource.match(/export const STATUS_EMOJI_COUNT=(\d+);/)?.[1]);
const optionCount=emojiCount+1; // the no-status radio plus every authored emoji

test('arrow keys move through the no-status option and all authored emoji choices',()=>{
 assert.equal(emojiCount,50);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',optionCount),1);
 assert.equal(getNextStatusEmojiFocusIndex(1,'ArrowDown',optionCount),2);
 assert.equal(getNextStatusEmojiFocusIndex(2,'ArrowLeft',optionCount),1);
 assert.equal(getNextStatusEmojiFocusIndex(2,'ArrowUp',optionCount),1);
 assert.equal(getNextStatusEmojiFocusIndex(emojiCount,'ArrowLeft',optionCount),emojiCount-1);
});

test('arrow navigation wraps at both ends of the full picker',()=>{
 assert.equal(getNextStatusEmojiFocusIndex(optionCount-1,'ArrowRight',optionCount),0);
 assert.equal(getNextStatusEmojiFocusIndex(optionCount-1,'ArrowDown',optionCount),0);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowLeft',optionCount),optionCount-1);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowUp',optionCount),optionCount-1);
});

test('Home and End move directly to the first and last choices',()=>{
 assert.equal(getNextStatusEmojiFocusIndex(8,'Home',optionCount),0);
 assert.equal(getNextStatusEmojiFocusIndex(0,'End',optionCount),optionCount-1);
});

test('unsupported keys and invalid item counts do not move focus',()=>{
 assert.equal(getNextStatusEmojiFocusIndex(2,'Enter',optionCount),null);
 assert.equal(getNextStatusEmojiFocusIndex(2,'Tab',optionCount),null);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',0),null);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',-1),null);
 assert.equal(getNextStatusEmojiFocusIndex(0,'ArrowRight',1.5),null);
});

test('invalid persisted status values consistently fall back to the no-status radio',()=>{
 assert.ok(source.includes('import StatusEmoji,{isStatusEmoji,'));
 assert.ok(source.includes('const hasValidStatus=isStatusEmoji(value)'));
 assert.ok(source.includes('const noStatusSelected=!hasValidStatus'));
 assert.ok(source.includes('const selectedIndex=hasValidStatus?value+1:0'));
 assert.ok(source.includes('aria-checked={noStatusSelected}'));
 assert.ok(source.includes("noStatusSelected?' is-selected':'"));
 assert.ok(source.includes('aria-checked={hasValidStatus&&value===i}'));
 assert.ok(source.includes("hasValidStatus&&value===i?' is-selected':'"));
});

test('picker exposes one roving tab stop and radio semantics for assistive technology',()=>{
 assert.ok(source.includes('role="radiogroup"'));
 assert.ok(source.includes('role="radio" aria-checked={noStatusSelected}'));
 assert.ok(source.includes('tabIndex={selectedIndex===0?0:-1}'));
 assert.ok(source.includes('tabIndex={selectedIndex===focusIndex?0:-1}'));
 assert.ok(source.includes('choiceRefs.current[next]?.focus()'));
 assert.ok(source.includes('onKeyDown={event=>handleKeyDown('));
 assert.doesNotMatch(source,/aria-pressed=/);
});
