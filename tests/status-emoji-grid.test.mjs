import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {getStatusEmojiGridTarget} from '../lib/status-emoji-grid.ts';

const picker=readFileSync(new URL('../components/StatusEmojiPicker.tsx',import.meta.url),'utf8');

test('horizontal navigation stays inside the current responsive grid row',()=>{
 assert.equal(getStatusEmojiGridTarget(0,'ArrowLeft',51,8),null);
 assert.equal(getStatusEmojiGridTarget(0,'ArrowRight',51,8),1);
 assert.equal(getStatusEmojiGridTarget(7,'ArrowRight',51,8),null);
 assert.equal(getStatusEmojiGridTarget(8,'ArrowLeft',51,8),null);
 assert.equal(getStatusEmojiGridTarget(12,'ArrowRight',51,6),13);
 assert.equal(getStatusEmojiGridTarget(4,'ArrowRight',51,5),null);
});

test('vertical navigation keeps the nearest column and clamps a partial last row',()=>{
 assert.equal(getStatusEmojiGridTarget(2,'ArrowDown',51,8),10);
 assert.equal(getStatusEmojiGridTarget(10,'ArrowUp',51,8),2);
 assert.equal(getStatusEmojiGridTarget(47,'ArrowDown',51,8),50);
 assert.equal(getStatusEmojiGridTarget(50,'ArrowUp',51,8),42);
 assert.equal(getStatusEmojiGridTarget(50,'ArrowDown',51,8),null);
 assert.equal(getStatusEmojiGridTarget(5,'ArrowDown',51,6),11);
 assert.equal(getStatusEmojiGridTarget(49,'ArrowDown',51,5),50);
});

test('Home and End reach the first and last picker option',()=>{
 assert.equal(getStatusEmojiGridTarget(23,'Home',51,8),0);
 assert.equal(getStatusEmojiGridTarget(0,'End',51,8),50);
});

test('invalid indices, dimensions and unrelated keys do not move focus',()=>{
 assert.equal(getStatusEmojiGridTarget(-1,'ArrowRight',51,8),null);
 assert.equal(getStatusEmojiGridTarget(51,'ArrowRight',51,8),null);
 assert.equal(getStatusEmojiGridTarget(0,'ArrowRight',51,0),null);
 assert.equal(getStatusEmojiGridTarget(0,'Enter',51,8),null);
});

test('status picker exposes one tab stop and responsive arrow-key navigation',()=>{
 assert.match(picker,/tabIndex=\\{tabStopIndex===0\\?0:-1\\}/);
 assert.match(picker,/tabIndex=\\{tabStopIndex===i\\+1\\?0:-1\\}/);
 assert.match(picker,/window\\.getComputedStyle\\(grid\\)\\.gridTemplateColumns/);
 assert.match(picker,/getStatusEmojiGridTarget\\(index,event\\.key,STATUS_EMOJI_COUNT\\+1,columns\\)/);
 assert.match(picker,/target\\.focus\\(\\)/);
 assert.match(picker,/Home и End/);
});
