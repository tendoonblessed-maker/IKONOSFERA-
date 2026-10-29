import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 mergeConfirmedRecentPage,
 prependEarlierPage,
 CONFIRMED_MESSAGE_GRACE_MS
} from '../lib/chat-history.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const CHAT='33333333-3333-4333-8333-333333333333';
const CHAT_B='44444444-4444-4444-8444-444444444444';
const NOW=1000;
const message=(id,overrides={})=>({
 id,chat_id:CHAT,sender_id:OWNER,body:'Сообщение',
 created_at:'2026-10-29T07:00:00.000Z',media_path:null,media_type:null,
 read_at:null,...overrides
});

test('database-confirmed new message remains visible after a stale network poll',()=>{
 const existing=message('a',{sender_id:OTHER,created_at:'2026-10-29T06:59:00.000Z'});
 const sent=message('b',{body:'Привет'});
 const pending=new Map([[sent.id,{message:sent,expiresAt:NOW+CONFIRMED_MESSAGE_GRACE_MS}]]);
 const immediate=prependEarlierPage([existing],[sent]);
 const reconciled=mergeConfirmedRecentPage(immediate,[existing],100,pending,CHAT,OWNER,NOW+50);
 assert.deepEqual(reconciled.map(m=>m.id),['a','b']);
 assert.equal(reconciled[1].body,'Привет');
 assert.equal(pending.size,1);
});

test('read-after-write confirmation releases overlay and accepts server read receipt',()=>{
 const sent=message('a',{read_at:null});
 const fromServer=message('a',{read_at:'2026-10-29T07:00:12.000Z'});
 const pending=new Map([[sent.id,{message:sent,expiresAt:NOW+CONFIRMED_MESSAGE_GRACE_MS}]]);
 const result=mergeConfirmedRecentPage([sent],[fromServer],100,pending,CHAT,OWNER,NOW+50);
 assert.deepEqual(result,[fromServer]);
 assert.equal(pending.size,0);
});

test('confirmed image appears once alongside its caption, never twice',()=>{
 const media=message('photo',{body:'Знакомьтесь',media_path:'some/private.jpg',media_type:'image'});
 const pending=new Map([[media.id,{message:media,expiresAt:NOW+CONFIRMED_MESSAGE_GRACE_MS}]]);
 const result=mergeConfirmedRecentPage([media],[media],100,pending,CHAT,OWNER,NOW+10);
 assert.equal(result.length,1);
 assert.equal(result[0].media_path,'some/private.jpg');
 assert.equal(result[0].body,'Знакомьтесь');
});

test('confirmed messages from another chat or account cannot appear',()=>{
 const sent=message('other',{chat_id:CHAT_B});
 const malicious=message('wrong-owner',{sender_id:OTHER});
 const pending=new Map([
 [sent.id,{message:sent,expiresAt:NOW+CONFIRMED_MESSAGE_GRACE_MS}],
 [malicious.id,{message:malicious,expiresAt:NOW+CONFIRMED_MESSAGE_GRACE_MS}]
 ]);
 assert.deepEqual(mergeConfirmedRecentPage([],[],100,pending,CHAT,OWNER,NOW+1),[]);
 assert.equal(pending.size,2);
});

test('in-memory confirmations expire and cannot resurrect deleted messages forever',()=>{
 const sent=message('a');
 const pending=new Map([[sent.id,{message:sent,expiresAt:NOW+100}]]);
 assert.deepEqual(mergeConfirmedRecentPage([sent],[],100,pending,CHAT,OWNER,NOW+101),[]);
 assert.equal(pending.size,0);
});

test('older paginated history remains intact after receiving a confirmed message',()=>{
 const early=message('early',{created_at:'2026-10-28T09:00:00.000Z'});
 const first=message('first',{created_at:'2026-10-29T06:59:00.000Z'});
 const second=message('second',{created_at:'2026-10-29T06:59:30.000Z'});
 const sent=message('now',{created_at:'2026-10-29T07:00:00.000Z'});
 const pending=new Map([[sent.id,{message:sent,expiresAt:NOW+CONFIRMED_MESSAGE_GRACE_MS}]]);
 const result=mergeConfirmedRecentPage([early,first,second,sent],[first,second],2,pending,CHAT,OWNER,NOW+10);
 assert.deepEqual(result.map(m=>m.id),['early','first','second','now']);
 assert.equal(result.length,4);
});
