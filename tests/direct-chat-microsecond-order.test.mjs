import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compareMessages,prependEarlierPage,mergeRecentPage} from '../lib/chat-history.ts';
const row=(id,created_at)=>({id,created_at,chat_id:'chat',sender_id:'sender',body:'hi'});
test('direct messages retain microsecond ordering',()=>{
 const early=row('z','2026-11-02T08:00:00.123455Z');
 const late=row('a','2026-11-02T08:00:00.123456Z');
 assert.ok(compareMessages(early,late)<0);
 assert.deepEqual(prependEarlierPage([late],[early]).map(x=>x.id),['z','a']);
});
test('variable precision and exact ties are deterministic',()=>{
 const messages=[row('z','2026-11-02T08:00:00.000001Z'),row('b','2026-11-02T08:00:00Z'),row('a','2026-11-02T08:00:00.000001Z'),row('c','2026-11-02T08:00:00.00001Z')];
 assert.deepEqual(messages.sort(compareMessages).map(x=>x.id),['b','a','z','c']);
});
test('poll does not discard older microsecond messages',()=>{
 const early=row('z','2026-11-02T08:00:00.123455Z');
 const first=row('a','2026-11-02T08:00:00.123456Z');
 const second=row('b','2026-11-02T08:00:00.123457Z');
 assert.deepEqual(mergeRecentPage([early,first],[first,second],2).map(x=>x.id),['z','a','b']);
});
