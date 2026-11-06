import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mergeConfirmedGroupMessages} from '../lib/group-history.ts';
import {compareMessageTimestampAndId} from '../lib/message-order.ts';

const GROUP='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const row=(id,created_at,body='message')=>({id,group_id:GROUP,sender_id:USER,created_at,body});

test('confirmed group sends retain microsecond order beside server polling rows',()=>{
 const newer=row('a','2026-11-02T01:00:00.123456Z');
 const older=row('z','2026-11-02T01:00:00.123455Z');
 const confirmations=new Map([[newer.id,{message:newer,expiresAt:2000}]]);
 const result=mergeConfirmedGroupMessages([older],confirmations,GROUP,USER,1000);
 assert.deepEqual(result.map(x=>x.id),['z','a']);
});

test('identical timestamps still use stable message ID ordering',()=>{
 const a=row('a','2026-11-02T01:00:00.123456Z');
 const z=row('z','2026-11-02T01:00:00.123456Z');
 const result=mergeConfirmedGroupMessages([z,a],new Map(),GROUP,USER,1000);
 assert.deepEqual(result.map(x=>x.id),['a','z']);
});

test('server updates win over confirmed rows with the same ID',()=>{
 const confirmed=row('same','2026-11-02T01:00:00.123456Z','old');
 const updated=row('same','2026-11-02T01:00:00.123456Z','edited');
 const confirmations=new Map([['same',{message:confirmed,expiresAt:2000}]]);
 const result=mergeConfirmedGroupMessages([updated],confirmations,GROUP,USER,1000);
 assert.equal(result.length,1);
 assert.equal(result[0].body,'edited');
 assert.equal(confirmations.size,0);
});

test('confirmed overlay uses the same microsecond order as paginated group history',()=>{
 const earlier=row('z','2026-11-06T09:00:00.1234Z');
 const confirmed=row('a','2026-11-06T10:00:00.123401+01:00');
 const sameInstant=row('b','2026-11-06T09:00:00.123401Z');
 const confirmations=new Map([[confirmed.id,{message:confirmed,expiresAt:2000}]]);
 const latest=[sameInstant,earlier];
 const actual=mergeConfirmedGroupMessages(latest,confirmations,GROUP,USER,1000);
 const expected=[...latest,confirmed].sort(compareMessageTimestampAndId);
 assert.deepEqual(actual.map(x=>x.id),expected.map(x=>x.id));
 assert.deepEqual(actual.map(x=>x.id),['z','a','b']);
});
