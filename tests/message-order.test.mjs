import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compareMessageTimestamps} from '../lib/message-order.ts';
import {compareMessages} from '../lib/chat-history.ts';
import {mergeConfirmedGroupMessages} from '../lib/group-history.ts';

const GROUP='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const earlyId='ffffffff-ffff-4fff-8fff-ffffffffffff';
const lateId='00000000-0000-4000-8000-000000000000';
const earlyTime='2026-10-29T09:50:12.123124Z';
const lateTime='2026-10-29T09:50:12.123125Z';

test('timestamp comparison preserves PostgreSQL microseconds within one millisecond',()=>{
 assert.ok(Date.parse(earlyTime)===Date.parse(lateTime),'Date.parse intentionally truncates both to the same millisecond');
 assert.ok(compareMessageTimestamps(earlyTime,lateTime)<0);
 assert.ok(compareMessageTimestamps(lateTime,earlyTime)>0);
});

test('equivalent timezone offsets compare as the same instant, including microseconds',()=>{
 assert.equal(
  compareMessageTimestamps('2026-10-29T09:50:12.123456+01:00','2026-10-29T08:50:12.123456Z'),
  0
 );
 assert.ok(
  compareMessageTimestamps('2026-10-29T09:50:12.123457+01:00','2026-10-29T08:50:12.123456Z')>0
 );
});

test('direct chat history orders sub-millisecond messages before using UUID tie-breakers',()=>{
 const early={id:earlyId,created_at:earlyTime};
 const late={id:lateId,created_at:lateTime};
 assert.ok(compareMessages(early,late)<0);
 assert.deepEqual([late,early].sort(compareMessages).map(row=>row.id),[earlyId,lateId]);
});

test('confirmed group messages keep the same microsecond order as database pagination',()=>{
 const early={id:earlyId,group_id:GROUP,sender_id:USER,body:'early',created_at:earlyTime};
 const late={id:lateId,group_id:GROUP,sender_id:USER,body:'late',created_at:lateTime};
 const result=mergeConfirmedGroupMessages([late,early],new Map(),GROUP,USER,Date.now());
 assert.deepEqual(result.map(row=>row.id),[earlyId,lateId]);
});
