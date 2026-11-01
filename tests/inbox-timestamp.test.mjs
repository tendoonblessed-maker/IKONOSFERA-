import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {inboxTimestamp} from '../lib/inbox-timestamp.ts';

const now=new Date(2026,10,1,15,30);
const local=(day,hour,minute)=>new Date(2026,10,day,hour,minute).toISOString();

test('today and yesterday have compact Telegram-like labels',()=>{
 assert.equal(inboxTimestamp(local(1,12,4),now)?.short,'12:04');
 assert.equal(inboxTimestamp(local(31,23,59),now)?.short,'31.10');
 assert.equal(inboxTimestamp(new Date(2026,9,31,23,59).toISOString(),now)?.short,'вчера');
});

test('future timestamps and malformed values do not claim to be today',()=>{
 assert.equal(inboxTimestamp(local(1,16,0),now)?.short,'01.11');
 assert.equal(inboxTimestamp('bad',now),null);
 assert.equal(inboxTimestamp(null,now),null);
});

test('full local date and canonical datetime remain available',()=>{
 const input=local(1,12,4);
 const stamp=inboxTimestamp(input,now);
 assert.equal(stamp?.iso,input);
 assert.match(stamp?.full||'',/2026/);
 assert.match(stamp?.full||'',/12:04/);
});

test('direct and group inbox rows use the same safe timestamp and tooltip',()=>{
 for(const path of ['components/ChatInboxRow.tsx','components/GroupInboxRow.tsx']){
  const content=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(content,/inboxTimestamp\(/);
  assert.match(content,/dateTime=\{stamp.iso\} title=\{stamp.full\}/);
  assert.doesNotMatch(content,/function timeLabel\(/);
 }
});
